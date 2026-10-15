import { desc, eq, lte, sql } from "drizzle-orm";
import type { LifeItem } from "../../domain/life-items";
import type { TempoDatabase } from "../client";
import { lifeItems } from "../schema";

const limits: Record<LifeItem["kind"], number> = { focus: 1, routine: 100, nutrition_target: 1, workout_plan: 100, recipe: 250, pantry: 250, grocery: 500, note: 250, food: 500, workout: 500, meal: 500 };
const selectedDayLimit = 1000;
type Coverage = { included: number; total: number; limit: number; truncated: boolean };

/** Independent kind budgets protect durable settings from diary growth. A
 * requested diary day has its own budget, separate from recent history. */
export async function readWorkspaceLifeItems(database: TempoDatabase, userId: string, diaryDate?: string) {
  const selected = diaryDate ? sql<boolean>`${lifeItems.data}->>'kind' in ('food','workout') and ${lifeItems.data}->>'date' = ${diaryDate}` : sql<boolean>`false`;
  const budget = sql<number>`case when ${selected} then ${selectedDayLimit}::integer else case ${lifeItems.data}->>'kind' ${sql.join(Object.entries(limits).map(([kind, limit]) => sql`when ${kind} then ${limit}::integer`), sql` `)} else 0 end end`;
  const ranked = database.select({
    id: lifeItems.id, version: lifeItems.version, data: lifeItems.data, createdAt: lifeItems.createdAt,
    selected: selected.as("selected_diary_day"), limit: budget.as("item_limit"),
    rank: sql<number>`row_number() over (partition by ${lifeItems.data}->>'kind', ${selected} order by ${lifeItems.createdAt} desc, ${lifeItems.id} desc)`.mapWith(Number).as("item_rank"),
    total: sql<number>`count(*) over (partition by ${lifeItems.data}->>'kind', ${selected})`.mapWith(Number).as("item_total"),
  }).from(lifeItems).where(eq(lifeItems.userId, userId)).as("ranked_life_items");
  const rows = await database.select().from(ranked).where(lte(ranked.rank, ranked.limit)).orderBy(desc(ranked.createdAt), desc(ranked.id));
  const itemCoverage = Object.fromEntries(Object.entries(limits).map(([kind, limit]) => [kind, { included: 0, total: 0, limit: limit + (diaryDate && (kind === "food" || kind === "workout") ? selectedDayLimit : 0), truncated: false }])) as Record<LifeItem["kind"], Coverage>;
  const diaryCoverage = diaryDate ? { date: diaryDate, food: { included: 0, total: 0, limit: selectedDayLimit, truncated: false }, workout: { included: 0, total: 0, limit: selectedDayLimit, truncated: false } } : null;
  const groups = new Set<string>();
  for (const row of rows) {
    const kind = row.data.kind, group = `${kind}:${row.selected}`;
    itemCoverage[kind].included += 1;
    if (!groups.has(group)) { itemCoverage[kind].total += row.total; groups.add(group); }
    if (row.selected && diaryCoverage && (kind === "food" || kind === "workout")) {
      diaryCoverage[kind].included += 1;
      diaryCoverage[kind].total = row.total;
      diaryCoverage[kind].truncated = row.total > selectedDayLimit;
    }
  }
  for (const coverage of Object.values(itemCoverage)) coverage.truncated = coverage.total > coverage.included;
  return { items: rows.map(({ id, version, data }) => ({ id, version, data })), itemsTruncated: Object.values(itemCoverage).some(coverage => coverage.truncated), itemCoverage, diaryCoverage };
}
