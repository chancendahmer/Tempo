import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { mutateWorkspace, readWorkspace } from "./workspace-repository";
import { LifeAssistant } from "./life-assistant";
import { WebReplySender, isWebMessage } from "./web-reply-repository";
import { DrizzleConversationHistoryRepository } from "./conversation-history-repository";
import { lifeItemSchema, localDay, type LifeItem } from "../../domain/life-items";

describe("shared life workspace", () => {
  let client: PGlite, db: TempoDatabase, owner: string, other: string;
  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    db = drizzle(client, { schema }) as unknown as TempoDatabase;
    const users = await db.insert(schema.users).values([{ phoneE164: "+12025550181", timezone: "America/New_York", onboardingState: "complete" }, { phoneE164: "+12025550182", onboardingState: "complete" }]).returning();
    [owner, other] = users.map(u => u.id);
  }, 30000);
  afterAll(async () => client.close());
  const recipe: LifeItem = { kind: "recipe", title: "Lemon rice", ingredients: "Rice\nLemon", instructions: "Cook rice, add lemon.", servings: 2, prepMinutes: 20, favorite: true };

  it("retains durable settings independently of diary growth and loads the complete requested old day", async () => {
    const [reader, neighbor] = await db.insert(schema.users).values([{ phoneE164: "+12025550644" }, { phoneE164: "+12025550645" }]).returning();
    const old = new Date("2020-01-01T00:00:00Z"), recent = new Date("2026-10-01T00:00:00Z");
    const food = { kind: "food" as const, title: "Oats", date: "2020-01-01", meal: "Breakfast" as const, calories: 120, protein: 4, carbs: null, fat: null, fiber: null };
    const oldFoods = [randomUUID(), randomUUID()], oldWorkout = randomUUID(), routine = randomUUID(), target = randomUUID();
    const diaryRows: (typeof schema.lifeItems.$inferInsert)[] = [
      { id: routine, userId: reader.id, createdAt: old, data: { kind: "routine", title: "Morning", period: "morning", time: "08:00", steps: [{ id: randomUUID(), title: "Water", minutes: 2, completedOn: null }] } },
      { id: target, userId: reader.id, createdAt: old, data: { kind: "nutrition_target", title: "My targets", calories: null, protein: 90, carbs: null, fat: null, fiber: null } },
      ...oldFoods.map(id => ({ id, userId: reader.id, createdAt: old, data: food })),
      { id: oldWorkout, userId: reader.id, createdAt: old, data: { kind: "workout", title: "Walk", date: food.date, minutes: 20, activity: "Walk" } },
      ...Array.from({ length: 1000 }, (_, n) => ({ id: randomUUID(), userId: reader.id, createdAt: recent, data: { ...food, title: `Recent oats ${n}`, date: "2026-10-01" } })),
      ...Array.from({ length: 501 }, (_, n) => ({ id: randomUUID(), userId: reader.id, createdAt: recent, data: { kind: "workout" as const, title: `Recent walk ${n}`, date: "2026-10-01", minutes: 10, activity: "Walk" as const } })),
      { id: randomUUID(), userId: neighbor.id, createdAt: old, data: { ...food, title: "Foreign food" } },
    ];
    await db.insert(schema.lifeItems).values(diaryRows);
    const history = await readWorkspace(reader.id, db, { diaryDate: "1999-01-01" });
    expect(history.items.map(row => row.id)).toEqual(expect.arrayContaining([routine, target]));
    expect(history.items.some(row => oldFoods.some(id => id === row.id) || row.id === oldWorkout)).toBe(false);
    expect(history.itemsTruncated).toBe(true);
    expect(history.itemCoverage.food).toEqual({ included: 500, total: 1002, limit: 1500, truncated: true });
    expect(history.itemCoverage.workout).toEqual({ included: 500, total: 502, limit: 1500, truncated: true });
    expect(history.diaryCoverage?.date).toBe("1999-01-01");
    const selected = await readWorkspace(reader.id, db, { diaryDate: food.date });
    expect(selected.items.map(row => row.id)).toEqual(expect.arrayContaining([routine, target, oldWorkout, ...oldFoods]));
    expect(selected.items.filter(row => row.data.kind === "food" && row.data.date === food.date).reduce((sum, row) => sum + (row.data.kind === "food" ? row.data.calories ?? 0 : 0), 0)).toBe(240);
    expect(selected.itemCoverage.food).toEqual({ included: 502, total: 1002, limit: 1500, truncated: true });
    expect(selected.diaryCoverage).toEqual({ date: food.date, food: { included: 2, total: 2, limit: 1000, truncated: false }, workout: { included: 1, total: 1, limit: 1000, truncated: false } });
    expect(JSON.stringify(selected)).not.toContain("Foreign food");
    await expect(readWorkspace(reader.id, db, { diaryDate: "2026-02-30" })).rejects.toThrow();
  });

  it("reports the exact partial-day boundary independently of other diary history", async () => {
    const [reader] = await db.insert(schema.users).values({ phoneE164: "+12025550646" }).returning();
    const food = { kind: "food" as const, title: "Diary entry", date: "2020-02-01", meal: "Snack" as const, calories: 1, protein: null, carbs: null, fat: null, fiber: null };
    await db.insert(schema.lifeItems).values([
      ...Array.from({ length: 1001 }, () => ({ id: randomUUID(), userId: reader.id, data: food })),
      { id: randomUUID(), userId: reader.id, data: { ...food, date: "2026-10-01" } },
    ]);
    const result = await readWorkspace(reader.id, db, { diaryDate: food.date });
    expect(result.items.filter(row => row.data.kind === "food" && row.data.date === food.date)).toHaveLength(1000);
    expect(result.itemCoverage.food).toEqual({ included: 1001, total: 1002, limit: 1500, truncated: true });
    expect(result.diaryCoverage).toEqual({ date: food.date, food: { included: 1000, total: 1001, limit: 1000, truncated: true }, workout: { included: 0, total: 0, limit: 1000, truncated: false } });
    const empty = await readWorkspace(reader.id, db, { diaryDate: "1999-01-01" });
    expect(empty.diaryCoverage?.food).toEqual({ included: 0, total: 0, limit: 1000, truncated: false });
  });

  it("defaults an undated read to account-local today, keeping its diary complete or explicitly partial", async () => {
    const now = new Date(), utcDay = localDay(now, "UTC");
    const timezone = localDay(now, "Pacific/Kiritimati") !== utcDay ? "Pacific/Kiritimati" : "Etc/GMT+12";
    const today = localDay(now, timezone);
    expect(today).not.toBe(utcDay);
    const [person] = await db.insert(schema.users).values({ phoneE164: "+12025550650", timezone }).returning();
    const food = { kind: "food" as const, title: "Today's older logged meal", date: today, meal: "Snack" as const, calories: 1, protein: null, carbs: null, fat: null, fiber: null };
    await db.insert(schema.lifeItems).values([
      ...Array.from({ length: 600 }, () => ({ id: randomUUID(), userId: person.id, createdAt: new Date("2020-01-01T00:00:00Z"), data: food })),
      ...Array.from({ length: 1001 }, () => ({ id: randomUUID(), userId: person.id, createdAt: now, data: { ...food, date: "1999-01-01" } })),
      { id: randomUUID(), userId: person.id, data: { kind: "workout", title: "Today's walk", date: today, minutes: 10, activity: "Walk" } },
    ]);
    const complete = await readWorkspace(person.id, db);
    expect(complete.diaryCoverage).toEqual({ date: today, food: { included: 600, total: 600, limit: 1000, truncated: false }, workout: { included: 1, total: 1, limit: 1000, truncated: false } });
    expect(complete.items.filter(row => row.data.kind === "food" && row.data.date === today)).toHaveLength(600);
    expect(complete.itemCoverage.food).toMatchObject({ total: 1601, included: 1100, truncated: true });
    await db.insert(schema.lifeItems).values(Array.from({ length: 401 }, () => ({ id: randomUUID(), userId: person.id, data: food })));
    const partial = await readWorkspace(person.id, db);
    expect(partial.diaryCoverage?.food).toEqual({ included: 1000, total: 1001, limit: 1000, truncated: true });
    expect(partial.items.filter(row => row.data.kind === "food" && row.data.date === today)).toHaveLength(1000);
    expect(partial.itemsTruncated).toBe(true);
  });

  it("keeps active records ahead of bounded completed history and reports truncation", async () => {
    const [person] = await db.insert(schema.users).values({ phoneE164: "+12025550643" }).returning();
    const completed = new Date("2020-01-01T00:00:00Z"), upcoming = new Date("2030-01-01T12:00:00Z");
    await db.insert(schema.tasks).values([
      ...Array.from({ length: 205 }, (_, index) => ({ userId: person.id, title: `Completed ${index}`, status: "completed" as const, dueAt: completed, updatedAt: completed })),
      { userId: person.id, title: "Still to do", status: "not_started", dueAt: upcoming },
    ]);
    await db.insert(schema.goals).values([
      ...Array.from({ length: 105 }, (_, index) => ({ userId: person.id, title: `Old goal ${index}`, status: "completed" as const })),
      { userId: person.id, title: "Current goal", status: "active" },
    ]);
    await db.insert(schema.reminders).values([
      ...Array.from({ length: 205 }, (_, index) => ({ userId: person.id, text: `Sent ${index}`, status: "sent" as const, remindAt: completed, timezone: "UTC", idempotencyKey: `workspace-history:${person.id}:${index}` })),
      { userId: person.id, text: "Upcoming reminder", status: "scheduled", remindAt: upcoming, timezone: "UTC", idempotencyKey: `workspace-upcoming:${person.id}` },
    ]);
    const workspace = await readWorkspace(person.id, db);
    expect(workspace.tasks).toHaveLength(200);
    expect(workspace.tasks[0].title).toBe("Still to do");
    expect(workspace.goals).toHaveLength(100);
    expect(workspace.goals[0].title).toBe("Current goal");
    expect(workspace.reminders).toHaveLength(200);
    expect(workspace.reminders[0].text).toBe("Upcoming reminder");
    expect(workspace).toMatchObject({ tasksTruncated: true, goalsTruncated: true, remindersTruncated: true });
  });

  it("finds bounded meal candidates when conversational date words do not match stored dates", async () => {
    const [person, outsider] = await db.insert(schema.users).values([{ phoneE164: "+12025550641" }, { phoneE164: "+12025550642" }]).returning();
    const meal = { kind: "meal" as const, title: "Lemon rice", ingredients: "rice and lemon", date: "2027-01-14", meal: "Dinner" as const, servings: 2 };
    const target = randomUUID();
    await mutateWorkspace(person.id, {action:"save",id:target,version:0,data:meal},db);
    await mutateWorkspace(outsider.id, {action:"save",id:randomUUID(),version:0,data:{...meal,title:"FOREIGN Lemon rice"}},db);
    const assistant = new LifeAssistant(db);
    const lookup = JSON.parse(await assistant.execute(person.id,randomUUID(),{type:"life_list",kind:"meal",query:"Lemon rice dinner January 14 2027"}));
    expect(lookup.items.map((row: {id:string})=>row.id)).toEqual([target]);
    expect(lookup.coverage.match).toBe("partial title candidates");
    expect(lookup.notice).toContain("Verify");
    expect(JSON.stringify(lookup)).not.toContain("FOREIGN");
    const exact = JSON.parse(await assistant.execute(person.id,randomUUID(),{type:"life_list",kind:"meal",query:"Lemon rice"}));
    expect(exact.coverage.match).toBe("all search words");
    const foreignId = JSON.parse(await assistant.execute(outsider.id,randomUUID(),{type:"life_list",kind:"meal",id:target,query:"Lemon rice"}));
    expect(foreignId.items).toEqual([]);
    const unrelated = JSON.parse(await assistant.execute(person.id,randomUUID(),{type:"life_list",kind:"meal",query:"pasta January 14 2027"}));
    expect(unrelated.items).toEqual([]);
    for (let n=0;n<22;n++) await mutateWorkspace(person.id,{action:"save",id:randomUUID(),version:0,data:{...meal,title:"Lemon pasta "+n}},db);
    const broad = JSON.parse(await assistant.execute(person.id,randomUUID(),{type:"life_list",kind:"meal",query:"Lemon January 14 2027"}));
    expect(broad.items).toHaveLength(20);
    expect(broad.truncated).toBe(true);
  });

  it("adds a complete grocery batch once, atomically and only to its account", async () => {
    const [batchUser] = await db.insert(schema.users).values({ phoneE164: "+12025550959" }).returning();
    const assistant = new LifeAssistant(db), source = randomUUID();
    const command = { type: "grocery_add" as const, items: ["Cucumber", "Lemon", "Feta"] };
    const replies = await Promise.all([assistant.execute(batchUser.id, source, command), assistant.execute(batchUser.id, source, command)]);
    expect(replies[0]).toBe("Added to your shopping list: Cucumber, Lemon, Feta.");
    expect(replies[1]).toBe(replies[0]);
    const rows = (await readWorkspace(batchUser.id, db)).items;
    expect(rows.map(row => row.data.title).sort()).toEqual(["Cucumber", "Feta", "Lemon"]);
    expect(rows.every(row => row.data.kind === "grocery" && !row.data.checked)).toBe(true);
    expect((await readWorkspace(other, db)).items.some(row => rows.some(created => row.id === created.id))).toBe(false);
    await expect(assistant.execute(batchUser.id, randomUUID(), { type: "grocery_add", items: ["Bread", ""] })).rejects.toThrow();
    expect((await readWorkspace(batchUser.id, db)).items).toHaveLength(3);
    expect(await assistant.execute(batchUser.id, source, { type: "grocery_add", items: ["Different"] })).toContain("already made a different change");
    expect((await readWorkspace(batchUser.id, db)).items).toHaveLength(3);
  });

  it("deduplicates unchecked groceries across messages but permits another purchase of checked items", async () => {
    const [buyer, neighbor] = await db.insert(schema.users).values([{ phoneE164: "+12025550957" }, { phoneE164: "+12025550958" }]).returning();
    const assistant = new LifeAssistant(db);
    await assistant.execute(buyer.id, randomUUID(), { type: "grocery_add", items: ["Cucumber", "  Olive   oil ", "olive oil"] });
    const reply = await assistant.execute(buyer.id, randomUUID(), { type: "grocery_add", items: ["CUCUMBER", "olive  oil", "Feta", " feta "] });
    expect(reply).toBe("Added to your shopping list: Feta. Already on your shopping list: CUCUMBER, olive oil.");
    expect((await readWorkspace(buyer.id, db)).items).toHaveLength(3);
    expect(await assistant.execute(neighbor.id, randomUUID(), { type: "grocery_add", items: ["Cucumber"] })).toBe("Added to your shopping list: Cucumber.");
    const cucumber = (await readWorkspace(buyer.id, db)).items.find(row => row.data.title === "Cucumber")!;
    await mutateWorkspace(buyer.id, { action: "save", id: cucumber.id, version: cucumber.version, data: { kind: "grocery", title: "Cucumber", checked: true } }, db);
    expect(await assistant.execute(buyer.id, randomUUID(), { type: "grocery_add", items: ["cucumber"] })).toBe("Added to your shopping list: cucumber.");
    const groceries = (await readWorkspace(buyer.id, db)).items;
    expect(groceries).toHaveLength(4);
    expect(groceries.filter(row => row.data.kind === "grocery" && !row.data.checked && row.data.title.toLowerCase() === "cucumber")).toHaveLength(1);
  });

  it("copies the full account-owned recipe into a meal without trusting model ingredients", async () => {
    const assistant = new LifeAssistant(db), recipeId = randomUUID(), mealId = randomUUID();
    const ingredients = "Chickpeas\nCucumber\nTomato\nLemon\nOlive oil\nParsley";
    await assistant.execute(owner, recipeId, { type: "life_save", data: { ...recipe, title: "Simple chickpea salad", ingredients } });
    const data = { kind: "meal" as const, title: "Chickpea salad", date: "2026-10-01", meal: "Dinner" as const, ingredients: "chickpeas (4 servings)", servings: 4 };
    const command = { type: "life_save" as const, sourceRecipeId: recipeId, data };
    expect(await assistant.execute(owner, mealId, command)).toContain("Saved");
    expect((await readWorkspace(owner, db)).items.find(row => row.id === mealId)?.data).toEqual({ ...data, ingredients, ingredientServings: 2, groceriesEnabled: true });
    await assistant.execute(owner, mealId, command);
    expect((await readWorkspace(owner, db)).items.filter(row => row.id === mealId)).toHaveLength(1);
    const otherMealId = randomUUID();
    expect(await assistant.execute(other, otherMealId, command)).toContain("couldn’t find");
    expect((await readWorkspace(other, db)).items.some(row => row.id === otherMealId)).toBe(false);
    await assistant.execute(owner, randomUUID(), { type: "life_patch", id: mealId, version: 1, patch: { kind: "meal", date: "2026-10-02" } });
    expect((await readWorkspace(owner, db)).items.find(row => row.id === mealId)?.data).toEqual({ ...data, ingredients, ingredientServings: 2, groceriesEnabled: true, date: "2026-10-02" });
    expect(lifeItemSchema.safeParse({ ...data, servings: 0 }).success).toBe(false);
    expect(lifeItemSchema.safeParse({ ...data, servings: 101 }).success).toBe(false);
    expect(lifeItemSchema.safeParse({ ...data, servings: 1.5 }).success).toBe(false);
    expect(lifeItemSchema.safeParse({ ...data, servings: undefined }).success).toBe(true);
  });

  it("saves recipes from the assistant into the same account workspace and handles replay", async () => {
    const assistant = new LifeAssistant(db), source = randomUUID();
    const command = { type: "life_save" as const, data: recipe };
    expect(await assistant.execute(owner, source, command)).toContain("Saved");
    await assistant.execute(owner, source, command);
    const data = await readWorkspace(owner, db);
    expect(data.items.filter(item => item.id === source)).toHaveLength(1);
    expect(data.items.find(item => item.id === source)?.data).toEqual(recipe);
    expect((await readWorkspace(other, db)).items).toHaveLength(0);
  });

  it("rejects a changed create replay rather than claiming the different payload was saved", async () => {
    const assistant = new LifeAssistant(db), source = randomUUID();
    await assistant.execute(owner, source, { type: "life_save", data: recipe });
    expect(await assistant.execute(owner, source, { type: "life_save", data: { ...recipe, servings: 9 } })).toContain("different change");
    expect((await readWorkspace(owner, db)).items.find(item => item.id === source)?.data).toEqual(recipe);
  });

  it.each<LifeItem>([
    { kind: "routine", title: "Morning", period: "morning", time: "08:00", steps: [{ id: "00000000-0000-4000-8000-000000000092", title: "Water", minutes: 2, completedOn: null }] },
    { kind: "food", title: "Yogurt", date: "2026-09-28", meal: "Breakfast", calories: 100, protein: 8, carbs: null, fat: null, fiber: null },
    { kind: "meal", title: "Rice bowl", date: "2026-09-28", meal: "Dinner", ingredients: "Rice" },
    { kind: "workout", title: "Walk", date: "2026-09-28", minutes: 20, activity: "Walk" },
    { kind: "note", title: "Weekend", body: "Visit the garden" },
    { kind: "grocery", title: "Oats", checked: false },
  ])("shares assistant CRUD for $kind with the app and isolates other accounts", async data => {
    const assistant = new LifeAssistant(db), id = randomUUID();
    await assistant.execute(owner, id, { type: "life_save", data });
    const { items: rows } = JSON.parse(await assistant.execute(owner, randomUUID(), { type: "life_list", kind: data.kind as "routine" }));
    expect(rows.find((row: { id: string }) => row.id === id)).toMatchObject({ version: 1, data });
    expect(JSON.parse(await assistant.execute(other, randomUUID(), { type: "life_list", kind: data.kind as "routine" })).items.some((row: { id: string }) => row.id === id)).toBe(false);
    const updated = { ...data, title: `${data.title} updated` };
    if (data.kind === "focus") throw new Error("Unexpected focus fixture");
    await assistant.execute(owner, randomUUID(), { type: "life_patch", id, version: 1, patch: { kind: data.kind, title: updated.title } });
    expect((await readWorkspace(owner, db)).items.find(item => item.id === id)).toMatchObject({ version: 2, data: updated });
    await assistant.execute(owner, randomUUID(), { type: "life_remove", id, version: 2 });
    expect((await readWorkspace(owner, db)).items.some(item => item.id === id)).toBe(false);
  });

  it("rejects foreign IDs and stale writes, while retrying an assistant edit and deletion safely", async () => {
    const id = randomUUID();
    await mutateWorkspace(owner, { action: "save", id, version: 0, data: recipe }, db);
    await expect(mutateWorkspace(other, { action: "save", id, version: 1, data: recipe }, db)).rejects.toThrow();
    await expect(mutateWorkspace(other, { action: "delete", id, version: 1 }, db)).rejects.toThrow();
    const assistant = new LifeAssistant(db), source = randomUUID();
    const edit = { type: "life_patch" as const, id, version: 1, patch: { kind: "recipe" as const, title: "Lemon rice bowl" } };
    await assistant.execute(owner, source, edit);
    expect(await assistant.execute(owner, source, edit)).toBe("Updated: Lemon rice bowl. Serves 2.");
    expect(await assistant.execute(owner, source, { ...edit, patch: { kind: "recipe", title: "Different mutation" } })).toContain("different change");
    await expect(mutateWorkspace(owner, { action: "save", id, version: 1, data: recipe }, db)).rejects.toThrow("changed elsewhere");
    const removal = { type: "life_remove" as const, id, version: 2 }, removeSource = randomUUID();
    expect(await assistant.execute(owner, removeSource, removal)).toBe("Removed.");
    expect(await assistant.execute(owner, removeSource, removal)).toBe("Removed.");
  });

  it("merges a surgical patch against stored fields and refuses stale or foreign patches", async () => {
    const assistant = new LifeAssistant(db), id = randomUUID(), source = randomUUID();
    await assistant.execute(owner, id, { type: "life_save", data: recipe });
    const patch = { type: "life_patch" as const, id, version: 1, patch: { kind: "recipe" as const, servings: 4 } };
    expect(await assistant.execute(other, randomUUID(), patch)).toContain("unavailable");
    expect(await assistant.execute(owner, source, patch)).toBe("Updated: Lemon rice. Serves 4.");
    expect(await assistant.execute(owner, source, patch)).toBe("Updated: Lemon rice. Serves 4.");
    expect(await assistant.execute(owner, randomUUID(), patch)).toContain("changed elsewhere");
    expect((await readWorkspace(owner, db)).items.find(row => row.id === id)).toMatchObject({ version: 2, data: { ...recipe, servings: 4 } });
  });

  it("searches every kind before limiting and reports ordered bounded lookup coverage", async () => {
    const [reader] = await db.insert(schema.users).values({ phoneE164: "+12025550956" }).returning();
    const assistant = new LifeAssistant(db), oldId = randomUUID();
    await db.insert(schema.lifeItems).values([
      { id: oldId, userId: reader.id, data: { ...recipe, title: "Old saffron rice" }, createdAt: new Date("2020-01-01T00:00:00Z") },
      ...Array.from({ length: 105 }, (_, i) => ({ id: randomUUID(), userId: reader.id, data: { ...recipe, title: `New recipe ${i}` }, createdAt: new Date(Date.UTC(2026, 0, i + 1)) })),
    ]);
    const all = JSON.parse(await assistant.execute(reader.id, randomUUID(), { type: "life_list", kind: "recipe" }));
    expect(all).toMatchObject({ truncated: true, coverage: { kind: "recipe", limit: 20, searched: true } });
    expect(all.items).toHaveLength(20);
    expect(all.items[0].data.title).toBe("New recipe 104");
    expect(all.items.some((row: { id: string }) => row.id === oldId)).toBe(false);
    const found = JSON.parse(await assistant.execute(reader.id, randomUUID(), { type: "life_list", kind: "recipe", query: "saffron" }));
    expect(found.items).toEqual([expect.objectContaining({ id: oldId })]);
    expect(found).toMatchObject({ truncated: false, coverage: { query: "saffron" } });
    expect(JSON.parse(await assistant.execute(reader.id, randomUUID(), { type: "life_list", kind: "recipe", id: oldId })).items).toHaveLength(1);
    expect(JSON.parse(await assistant.execute(other, randomUUID(), { type: "life_list", kind: "recipe", id: oldId })).items).toHaveLength(0);
    expect(JSON.parse(await assistant.execute(reader.id, randomUUID(), { type: "life_list", kind: "note", id: oldId })).items).toHaveLength(0);
  });

  it("retrieves food by meal and date before a cross-channel nutrient correction", async () => {
    const assistant = new LifeAssistant(db), id = randomUUID();
    const food = { kind: "food" as const, title: "Yogurt", date: "2027-01-13", meal: "Breakfast" as const, calories: 100, protein: 8, carbs: null, fat: null, fiber: null };
    await assistant.execute(owner, id, { type: "life_save", data: food });
    const lookup = { type: "life_list" as const, kind: "food" as const, query: "yogurt breakfast 2027-01-13" };
    const found = JSON.parse(await assistant.execute(owner, randomUUID(), lookup));
    expect(found.items).toEqual([expect.objectContaining({ id, version: 1, data: food })]);
    expect(JSON.parse(await assistant.execute(other, randomUUID(), lookup)).items).toHaveLength(0);
    await assistant.execute(owner, randomUUID(), { type: "life_patch", id, version: found.items[0].version, patch: { kind: "food", protein: 12 } });
    expect(JSON.parse(await assistant.execute(owner, randomUUID(), lookup)).items).toEqual([expect.objectContaining({ id, version: 2, data: { ...food, protein: 12 } })]);
  });

  it("keeps task creation atomic and idempotent, and clears a paused focus when the task completes", async () => {
    const requestId = randomUUID();
    const create = { action: "task" as const, requestId, command: { type: "create_task" as const, title: "Do the dishes", estimatedMinutes: 10 } };
    await mutateWorkspace(owner, create, db); await mutateWorkspace(owner, create, db);
    const created = (await readWorkspace(owner, db)).tasks.filter(t => t.title === "Do the dishes");
    expect(created).toHaveLength(1);
    const taskId = created[0].id;
    await mutateWorkspace(owner, { action: "task", requestId: randomUUID(), command: { type: "start_task", taskId } }, db);
    const id = randomUUID();
    await mutateWorkspace(owner, { action: "save", id, version: 0, data: { kind: "focus", title: "Do the dishes", taskId, endsAt: null, remaining: 90 } }, db);
    await mutateWorkspace(owner, { action: "task", requestId: randomUUID(), command: { type: "complete_task", taskId } }, db);
    const after = await readWorkspace(owner, db);
    expect(after.tasks.find(t => t.id === taskId)?.status).toBe("completed");
    expect(after.items.some(item => item.id === id)).toBe(false);
    await expect(mutateWorkspace(other, { action: "task", requestId: randomUUID(), command: { type: "complete_task", taskId } }, db)).rejects.toThrow();
    const reopen = { action: "task" as const, requestId: randomUUID(), command: { type: "reopen_task" as const, taskId } };
    await expect(mutateWorkspace(other, reopen, db)).rejects.toThrow();
    await mutateWorkspace(owner, reopen, db);
    await mutateWorkspace(owner, reopen, db);
    const reopened = (await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)))[0];
    expect(reopened).toMatchObject({ title: "Do the dishes", estimatedMinutes: 10, status: "not_started", startedAt: null, completedAt: null });
    expect((await readWorkspace(owner, db)).items.some(item => item.id === id)).toBe(false);
    expect((await db.select().from(schema.taskEvents).where(eq(schema.taskEvents.taskId, taskId))).filter(event => event.changes.status === "not_started")).toHaveLength(1);
    await expect(mutateWorkspace(owner, { ...reopen, requestId: randomUUID() }, db)).rejects.toThrow("find that task");
  });

  it("finishes a routine step and its timer atomically, preserves neighboring steps, and validates ownership", async () => {
    const id = randomUUID(), stepId = randomUUID(), second = randomUUID();
    await mutateWorkspace(owner, { action: "save", id, version: 0, data: { kind: "routine", title: "Morning", period: "morning", time: "08:00", steps: [{ id: stepId, title: "Water", minutes: 1, completedOn: null }, { id: second, title: "Breakfast", minutes: 10, completedOn: null }] } }, db);
    const focusId = randomUUID();
    const focus: LifeItem = { kind: "focus", title: "Water", routineId: id, stepId, endsAt: null, remaining: 60 };
    await expect(mutateWorkspace(other, { action: "save", id: randomUUID(), version: 0, data: focus }, db)).rejects.toThrow();
    await mutateWorkspace(owner, { action: "save", id: focusId, version: 0, data: focus }, db);
    await expect(mutateWorkspace(owner, { action: "save", id: randomUUID(), version: 0, data: focus }, db)).rejects.toThrow("already running");
    await mutateWorkspace(owner, { action: "finish_focus", id: focusId, version: 1 }, db);
    const result = await readWorkspace(owner, db), routine = result.items.find(item => item.id === id)?.data;
    expect(result.items.some(item => item.id === focusId)).toBe(false);
    if (routine?.kind !== "routine") throw new Error("Missing routine");
    expect(routine.steps[0].completedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(routine.steps[1].completedOn).toBeNull();
  });

  it("stops task focus atomically, rejects stale and foreign sessions, and permits a later focus", async () => {
    const [person, neighbor] = await db.insert(schema.users).values([{ phoneE164: "+12025550647" }, { phoneE164: "+12025550648" }]).returning();
    const startedAt = new Date("2026-10-15T12:00:00Z"), dueAt = new Date("2027-01-01T12:00:00Z");
    const [task] = await db.insert(schema.tasks).values({ userId: person.id, title: "Write letter", estimatedMinutes: 20, dueAt, status: "in_progress", startedAt }).returning();
    const id = randomUUID();
    const focus = { kind: "focus" as const, title: task.title, taskId: task.id, endsAt: null, remaining: 600 };
    await mutateWorkspace(person.id, { action: "save", id, version: 0, data: focus }, db);
    const stop = { action: "stop_focus" as const, requestId: randomUUID(), focus: { id, version: 1 }, task: { id: task.id, startedAt: startedAt.toISOString() } };
    await expect(mutateWorkspace(neighbor.id, stop, db)).rejects.toThrow("changed");
    await expect(mutateWorkspace(person.id, { ...stop, focus: { id, version: 2 } }, db)).rejects.toThrow("changed");
    await expect(mutateWorkspace(person.id, { ...stop, task: { id: task.id, startedAt: new Date(startedAt.getTime() - 1).toISOString() } }, db)).rejects.toThrow("changed");
    expect((await readWorkspace(person.id, db)).items.some(row => row.id === id)).toBe(true);
    await mutateWorkspace(person.id, stop, db);
    await mutateWorkspace(person.id, stop, db);
    const stopped = (await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0];
    expect(stopped).toMatchObject({ title: task.title, estimatedMinutes: 20, dueAt, status: "not_started", startedAt: null, completedAt: null, abandonedAt: null });
    expect((await readWorkspace(person.id, db)).items.some(row => row.id === id)).toBe(false);
    expect(await db.select().from(schema.taskEvents).where(eq(schema.taskEvents.taskId, task.id))).toHaveLength(1);
    await mutateWorkspace(person.id, { action: "task", requestId: randomUUID(), command: { type: "start_task", taskId: task.id } }, db);
    const [resumed] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id));
    await mutateWorkspace(person.id, stop, db);
    expect((await readWorkspace(person.id, db)).tasks.find(row => row.id === task.id)?.status).toBe("in_progress");
    await expect(mutateWorkspace(person.id, { action: "stop_focus", requestId: randomUUID(), task: stop.task }, db)).rejects.toThrow("changed");
    await mutateWorkspace(person.id, { action: "stop_focus", requestId: randomUUID(), task: { id: task.id, startedAt: resumed.startedAt!.toISOString() } }, db);
    expect((await readWorkspace(person.id, db)).tasks.find(row => row.id === task.id)?.status).toBe("not_started");
  });

  it("stops routine focus without completing the step and rejects stale fallback task stops", async () => {
    const [person] = await db.insert(schema.users).values({ phoneE164: "+12025550649" }).returning();
    const routineId = randomUUID(), stepId = randomUUID(), focusId = randomUUID();
    const routine = { kind: "routine" as const, title: "Evening", period: "evening" as const, time: "20:00", steps: [{ id: stepId, title: "Journal", minutes: 5, completedOn: null }] };
    await mutateWorkspace(person.id, { action: "save", id: routineId, version: 0, data: routine }, db);
    await mutateWorkspace(person.id, { action: "save", id: focusId, version: 0, data: { kind: "focus", title: "Journal", routineId, stepId, remaining: 200, endsAt: null } }, db);
    const stop = { action: "stop_focus" as const, requestId: randomUUID(), focus: { id: focusId, version: 1 } };
    await expect(mutateWorkspace(person.id, { action: "stop_focus", requestId: randomUUID(), task: { id: randomUUID(), startedAt: null } }, db)).rejects.toThrow("changed");
    await mutateWorkspace(person.id, stop, db);
    await mutateWorkspace(person.id, stop, db);
    const workspace = await readWorkspace(person.id, db);
    expect(workspace.items.find(row => row.id === routineId)).toMatchObject({ version: 1, data: routine });
    expect(workspace.items.some(row => row.data.kind === "focus")).toBe(false);
    await mutateWorkspace(person.id, { action: "save", id: randomUUID(), version: 0, data: { kind: "focus", title: "Journal", routineId, stepId, remaining: 300, endsAt: null } }, db);
    await expect(mutateWorkspace(person.id, { ...stop, requestId: randomUUID() }, db)).rejects.toThrow("changed");
    expect((await readWorkspace(person.id, db)).items.filter(row => row.data.kind === "focus")).toHaveLength(1);
  });

  it("enqueues web messages once and stores a shared-history reply without an SMS provider", async () => {
    const input = { action: "chat" as const, requestId: randomUUID(), text: "Save my lemon rice recipe" };
    await mutateWorkspace(owner, input, db); await mutateWorkspace(owner, input, db);
    const [source] = await db.select().from(schema.conversationMessages).where(and(eq(schema.conversationMessages.userId, owner), eq(schema.conversationMessages.body, input.text)));
    expect(await isWebMessage(source.id, db)).toBe(true);
    const jobs = await db.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.idempotencyKey, `web-process:${source.id}`));
    expect(jobs).toHaveLength(1);
    const sender = new WebReplySender(source.id, db);
    const reply = { userId: owner, body: "Saved your recipe.", kind: "coach" as const, idempotencyKey: `reply:${source.id}` };
    await sender.send(reply); await sender.send(reply);
    await expect(sender.send({ ...reply, userId: other })).rejects.toThrow();
    const outbound = await db.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.idempotencyKey, reply.idempotencyKey));
    expect(outbound).toHaveLength(1); expect(outbound[0].provider).toBeNull();
    expect((await readWorkspace(owner, db)).messages.some(m => m.body === reply.body)).toBe(true);
    const followup = await db.insert(schema.conversationMessages).values({ userId: owner, conversationId: source.conversationId, direction: "inbound", kind: "user", status: "received", body: "What ingredients did I save?", createdAt: new Date(Date.now() + 1000) }).returning();
    const history = await new DrizzleConversationHistoryRepository(db).getRecent({ conversationId: source.conversationId, beforeMessageId: followup[0].id, limit: 10 });
    expect(history.some(m => m.content === reply.body)).toBe(true);
    expect(history.find(m => m.content === reply.body)?.replyToMessageId).toBe(source.id);
  });
});
