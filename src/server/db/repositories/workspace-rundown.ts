import { and, asc, desc, eq, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { lifeItemSchema, type LifeItem } from "../../domain/life-items";
import { groceriesForMeals, ingredientKey, shouldKeepMealGroceryChecked } from "../../domain/meal-groceries";
import { isSensitiveMemory } from "../../domain/memory-service";
import type { RundownDetails, RundownIncludeSection, RundownRows, WorkspaceRundown, WorkspaceRundownOptions } from "../../domain/rundown";
import type { TempoDatabase } from "../client";
import { lifeItems } from "../schema";

/** Read the same structured records used by the dashboard. Each kind has a
 * separate bounded budget so a full meal history cannot hide a routine. */
const kind = sql<string>`${lifeItems.data}->>'kind'`;
const date = sql<string>`${lifeItems.data}->>'date'`;
const text = z.string().min(1).max(240);
const nutrient = z.number().nonnegative().nullable();
const food = z.object({
  title: text, date: z.iso.date(), meal: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]),
  calories: nutrient, protein: nutrient, carbs: nutrient, fat: nutrient, fiber: nutrient,
});
const workoutPlan = z.object({ title: text, sessions: z.array(z.object({ name: text, minutes: z.number().int().positive() })).min(1).max(4), moreSessions: z.boolean() });
const thought = z.object({ title: text, body: z.string().max(10000) });

const objectFields = (...keys: string[]) => sql.join(keys.map(key => sql`${key}::text, ${lifeItems.data}->(${key}::text)`), sql`, `);
const projection = (fields: SQL) => sql<unknown>`jsonb_build_object(${fields})`;

async function readBase(database: TempoDatabase, userId: string, startDate: string, endDateExclusive: string): Promise<WorkspaceRundown> {
  const ranked = database.select({
    id: lifeItems.id, data: lifeItems.data,
    rank: sql<number>`row_number() over (partition by ${kind} order by coalesce(${date}, ${lifeItems.data}->>'time') asc, ${lifeItems.id} asc)`.mapWith(Number).as("rundown_rank"),
    total: sql<number>`count(*) over (partition by ${kind})`.mapWith(Number).as("rundown_total"),
  }).from(lifeItems).where(and(eq(lifeItems.userId, userId), sql`(${kind} = 'routine' or (${kind} in ('meal', 'workout') and ${date} >= ${startDate} and ${date} < ${endDateExclusive}))`)).as("rundown_items");
  const rows = await database.select().from(ranked).where(lte(ranked.rank, 100)).orderBy(asc(ranked.rank), asc(ranked.id));
  const items: WorkspaceRundown["items"] = [];
  for (const row of rows) {
    const data = lifeItemSchema.parse(row.data);
    if (data.kind === "routine" || data.kind === "meal" || data.kind === "workout") items.push({ id: row.id, data });
  }
  return { items, truncated: rows.some(row => row.total > 100) };
}

export async function readWorkspaceRundown(database: TempoDatabase, userId: string, startDate: string, endDateExclusive: string,
  options?: WorkspaceRundownOptions): Promise<WorkspaceRundown> {
  z.iso.date().parse(startDate);
  z.iso.date().parse(endDateExclusive);
  const span = (Date.parse(endDateExclusive) - Date.parse(startDate)) / 86400000;
  if (span < 1 || span > 7) throw new Error("Workspace rundown requires one to seven days");
  const base = () => readBase(database, userId, startDate, endDateExclusive);
  if (!options?.include.length) return base();
  const { include, currentDate } = options;
  z.iso.date().parse(currentDate);

  const read = async <T>(itemKind: string, columns: SQL, schema: z.ZodType<T>, limit: number): Promise<RundownRows<T>> => {
    const rows = await database.select({ data: projection(columns) }).from(lifeItems).where(and(
      eq(lifeItems.userId, userId), sql`${kind} = ${itemKind}`,
      itemKind === "food" ? sql`${date} >= ${startDate} and ${date} < ${endDateExclusive}` : undefined,
    )).orderBy(desc(lifeItems.updatedAt), desc(lifeItems.id)).limit(limit + 1);
    return { items: rows.slice(0, limit).map(row => schema.parse(row.data)), truncated: rows.length > limit };
  };
  const optional = <T>(section: RundownIncludeSection, query: () => Promise<T>) =>
    include.includes(section) ? query().catch(() => null) : undefined;
  const sessions = sql`case when jsonb_typeof(${lifeItems.data}->'sessions') = 'array' then ${lifeItems.data}->'sessions' else '[]'::jsonb end`;
  const [original, foodRows, shopping, plans, thoughts] = await Promise.all([
    base().catch(() => ({ items: [], truncated: false, unavailable: true as const })),
    optional("food", () => read("food", objectFields("title", "date", "meal", "calories", "protein", "carbs", "fat", "fiber"), food, 100)),
    optional("shopping", () => readShopping(database, userId, currentDate)),
    optional("workoutPlans", () => read("workout_plan", sql`${objectFields("title")},
      'sessions', (select coalesce(jsonb_agg(jsonb_build_object('name', part->'name', 'minutes', part->'minutes') order by position), '[]'::jsonb)
        from jsonb_array_elements(${sessions}) with ordinality as session(part, position) where position <= 4),
      'moreSessions', jsonb_array_length(${sessions}) > 4`, workoutPlan, 8)),
    optional("thoughts", async () => {
      const result = await read("note", objectFields("title", "body"), thought, 8);
      return { truncated: result.truncated, items: result.items.map(({ title, body }) => {
        if (isSensitiveMemory(`${title} ${body}`)) return { title: "Private thought", preview: "", previewTruncated: false };
        const characters = Array.from(body);
        return { title, preview: characters.slice(0, 160).join(""), previewTruncated: characters.length > 160 };
      }) };
    }),
  ]);
  const details: RundownDetails = { ...shopping, food: foodRows, workoutPlans: plans, thoughts };
  return { ...original, details };
}

type ShoppingKind = "meal" | "pantry" | "manual" | "generated";
const shoppingInputLimit = 100;
const shoppingOutputLimit = 12;
const shoppingKind = sql<ShoppingKind>`case when ${kind} <> 'grocery' then ${kind}
  when jsonb_typeof(${lifeItems.data}->'mealSources') = 'array' then 'generated' else 'manual' end`;
const grocerySources = sql`case when jsonb_typeof(${lifeItems.data}->'mealSources') = 'array' then ${lifeItems.data}->'mealSources' else '[]'::jsonb end`;
const shoppingData = sql<unknown>`case when ${kind} <> 'grocery' then ${lifeItems.data}
  else jsonb_strip_nulls(jsonb_build_object(${objectFields("kind", "title", "quantity", "unit", "checked")}))
    || case when ${shoppingKind} = 'generated' then jsonb_build_object('mealSources',
      (select coalesce(jsonb_agg(part), '[]'::jsonb) from jsonb_array_elements(${grocerySources}) as source(part)
       where part->'quantity' = 'null'::jsonb))
      else '{}'::jsonb end end`;

/** Compute the current shopping view from one owned snapshot without saving derived rows. */
async function readShopping(database: TempoDatabase, userId: string, today: string): Promise<Pick<RundownDetails, "groceries" | "pantry" | "derivedShoppingUnavailable">> {
  const ranked = database.select({
    id: lifeItems.id, data: shoppingData.as("shopping_data"), group: shoppingKind.as("shopping_group"),
    rank: sql<number>`row_number() over (partition by ${shoppingKind} order by ${lifeItems.updatedAt} desc, ${lifeItems.id} desc)`.mapWith(Number).as("shopping_rank"),
  }).from(lifeItems).where(and(eq(lifeItems.userId, userId), sql`(${kind} in ('grocery', 'pantry')
    or (${kind} = 'meal' and ${date} >= ${today} and ${lifeItems.data}->'groceriesEnabled' = 'true'::jsonb))`)).as("rundown_shopping");
  const rows = await database.select().from(ranked).where(lte(ranked.rank,
    sql`case when ${ranked.group} = 'manual' then ${shoppingOutputLimit + 1}::int else ${shoppingInputLimit + 1}::int end`)).orderBy(asc(ranked.rank));
  const part = <K extends LifeItem["kind"]>(group: ShoppingKind, expected: K, limit: number) => {
    const matches = rows.filter(row => row.group === group);
    const items = matches.slice(0, limit).map(row => ({ id: row.id, version: 1, parsed: lifeItemSchema.safeParse(row.data) }));
    return {
      items: items.flatMap(({ id, version, parsed }) => parsed.success && parsed.data.kind === expected
        ? [{ id, version, data: parsed.data as Extract<LifeItem, { kind: K }> }] : []),
      complete: matches.length <= limit && items.every(({ parsed }) => parsed.success && parsed.data.kind === expected),
      truncated: matches.length > limit,
    };
  };
  const meals = part("meal", "meal", shoppingInputLimit);
  const pantry = part("pantry", "pantry", shoppingInputLimit);
  const prior = part("generated", "grocery", shoppingInputLimit);
  const manual = part("manual", "grocery", shoppingOutputLimit);
  const amount = (data: Extract<LifeItem, { kind: "grocery" | "pantry" }>) =>
    ({ title: data.title, quantity: data.quantity ?? null, unit: data.unit ?? null });
  const persisted = new Map(prior.items.map(item => [ingredientKey(item.data), item.data]));
  const fresh = meals.complete && pantry.complete && prior.complete ? (() => {
    try { return groceriesForMeals([...meals.items, ...pantry.items], today); } catch { return null; }
  })() : null;
  const derived = fresh ? [...fresh].slice(0, shoppingOutputLimit).map(([key, data]) =>
    ({ ...amount(data), checked: shouldKeepMealGroceryChecked(persisted.get(key), data), mealDerived: true })) : [];
  return {
    groceries: { items: [...manual.items.map(({ data }) => ({ ...amount(data), checked: data.checked, mealDerived: false })), ...derived],
      truncated: !manual.complete || (fresh?.size ?? 0) > shoppingOutputLimit },
    pantry: pantry.items.length || pantry.complete
      ? { items: pantry.items.slice(0, shoppingOutputLimit).map(({ data }) => amount(data)), truncated: !pantry.complete || pantry.items.length > shoppingOutputLimit }
      : null,
    ...(fresh ? {} : { derivedShoppingUnavailable: true }),
  };
}
