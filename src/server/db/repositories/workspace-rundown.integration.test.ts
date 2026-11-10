import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { readWorkspaceRundown } from "./workspace-rundown";
import { LifeAssistant } from "./life-assistant";

describe("workspace rundown source", () => {
  let client: PGlite, db: TempoDatabase, owner: string, other: string;
  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    db = drizzle(client, { schema }) as unknown as TempoDatabase;
    [owner, other] = (await db.insert(schema.users).values([{ phoneE164: "+12025550111" }, { phoneE164: "+12025550112" }]).returning()).map(row => row.id);
  }, 30000);
  afterAll(async () => client.close());
  it("filters dates and ownership before independent kind limits and reads corrections immediately", async () => {
    const meal = (title: string, date: string) => ({ kind: "meal" as const, title, date, meal: "Dinner" as const, ingredients: "rice", servings: 2 });
    const routine = { kind: "routine" as const, title: "Morning", time: "07:00", period: "morning" as const, steps: [] };
    const [saved] = await db.insert(schema.lifeItems).values([
      { id: randomUUID(), userId: owner, data: meal("My dinner", "2027-03-14") },
      { id: randomUUID(), userId: owner, data: meal("Before boundary", "2027-03-13") },
      { id: randomUUID(), userId: owner, data: meal("After boundary", "2027-03-15") },
      { id: randomUUID(), userId: other, data: meal("Foreign dinner", "2027-03-14") },
      { id: randomUUID(), userId: owner, data: routine },
      { id: randomUUID(), userId: owner, data: { kind: "workout", title: "Actual walk", date: "2027-03-14", minutes: 12, activity: "Walk" } },
    ]).returning();
    const source = new LifeAssistant(db);
    let result = await source.listForRundown(owner, "2027-03-14", "2027-03-15");
    expect(result.items.map(item => item.data.title).sort()).toEqual(["Actual walk", "Morning", "My dinner"]);
    expect(result.truncated).toBe(false);
    await db.update(schema.lifeItems).set({ data: meal("Corrected dinner", "2027-03-14") }).where(eq(schema.lifeItems.id, saved.id));
    result = await source.listForRundown(owner, "2027-03-14", "2027-03-15");
    expect(result.items.some(item => item.data.title === "Corrected dinner")).toBe(true);
    expect(result.items.some(item => item.data.title === "My dinner")).toBe(false);
    await db.delete(schema.lifeItems).where(eq(schema.lifeItems.id, saved.id));
    expect((await source.listForRundown(owner, "2027-03-14", "2027-03-15")).items.some(item => item.id === saved.id)).toBe(false);
    await db.insert(schema.lifeItems).values(Array.from({ length: 101 }, (_, index) => ({ id: randomUUID(), userId: owner, data: meal(`Dinner ${index}`, "2027-03-14") })));
    result = await source.listForRundown(owner, "2027-03-14", "2027-03-15");
    expect(result.items.filter(item => item.data.kind === "meal")).toHaveLength(100);
    expect(result.items.some(item => item.data.kind === "routine")).toBe(true);
    expect(result.items.some(item => item.data.kind === "workout")).toBe(true);
    expect(result.truncated).toBe(true);
  });
  it("reads only requested owner projections and filters food dates before its independent cap", async () => {
    const day = "2027-03-14";
    const food = (title: string, date: string) => ({ kind: "food" as const, title, date, meal: "Lunch" as const,
      calories: 0, protein: null, carbs: 2, fat: null, fiber: null });
    const sessions = Array.from({ length: 5 }, (_, index) => ({
      name: `Session ${index}`, minutes: 10 + index, exercises: [{ name: "Do not return exercise details", dose: "8 reps" }],
    }));
    await db.insert(schema.lifeItems).values([
      ...Array.from({ length: 102 }, (_, index) => ({ id: randomUUID(), userId: owner, data: food(`Earlier ${index}`, "2027-03-13") })),
      { id: randomUUID(), userId: owner, data: food("Owned lunch", day) },
      { id: randomUUID(), userId: other, data: food("Foreign lunch", day) },
      { id: randomUUID(), userId: owner, data: { kind: "grocery", title: "Tea", checked: true } },
      { id: randomUUID(), userId: other, data: { kind: "pantry", title: "Foreign stock", quantity: 1, unit: "g" } },
      { id: randomUUID(), userId: owner, data: { kind: "workout_plan", title: "Owned plan", templateId: "internal template", sessions } },
      { id: randomUUID(), userId: owner, data: { kind: "note", title: "Owned note", body: "a".repeat(160) + " private suffix" } },
      { id: randomUUID(), userId: owner, data: { kind: "note", title: "Wi-Fi password", body: "fixture-credential" } },
      { id: randomUUID(), userId: owner, data: { kind: "note", title: "Unmarked title", body: "a".repeat(158) + " password is beyond the preview" } },
      { id: randomUUID(), userId: other, data: { kind: "note", title: "Foreign note", body: "Not owned" } },
    ]);
    const defaultPlan = await readWorkspaceRundown(db, owner, day, "2027-03-15");
    expect(defaultPlan).not.toHaveProperty("details");
    const result = await readWorkspaceRundown(db, owner, day, "2027-03-15", { include: ["food", "shopping", "workoutPlans", "thoughts"], currentDate: day });
    expect(result.details?.food).toEqual({ items: [{ title: "Owned lunch", date: day, meal: "Lunch", calories: 0, protein: null, carbs: 2, fat: null, fiber: null }], truncated: false });
    expect(result.details?.groceries).toEqual({ items: [{ title: "Tea", checked: true, quantity: null, unit: null, mealDerived: false }], truncated: false });
    expect(result.details?.pantry).toEqual({ items: [], truncated: false });
    expect(result.details?.workoutPlans).toEqual({ items: [{ title: "Owned plan", sessions: sessions.slice(0, 4).map(({ name, minutes }) => ({ name, minutes })), moreSessions: true }], truncated: false });
    expect(result.details?.thoughts).toEqual({ items: expect.arrayContaining([
      { title: "Owned note", preview: "a".repeat(160), previewTruncated: true },
      { title: "Private thought", preview: "", previewTruncated: false },
    ]), truncated: false });
    expect(result.details?.thoughts?.items).toHaveLength(3);
    expect(JSON.stringify(result.details?.thoughts)).not.toMatch(/credential|password|Unmarked title|Foreign note/);
    await db.insert(schema.lifeItems).values(Array.from({ length: 100 }, (_, index) => ({ id: randomUUID(), userId: owner, data: food(`Same date ${index}`, day) })));
    const capped = await readWorkspaceRundown(db, owner, day, "2027-03-15", { include: ["food"], currentDate: day });
    expect(capped.details?.food?.items).toHaveLength(100);
    expect(capped.details?.food?.truncated).toBe(true);
    expect(capped.details?.thoughts).toBeUndefined();
  });

  it("keeps optional source failures independent of each other and the default plan", async () => {
    const note = { kind: "note" as const, title: "Visible note", body: "One detail" };
    await db.insert(schema.lifeItems).values({ id: randomUUID(), userId: owner, data: note });
    await client.query("insert into life_items(id, user_id, data) values ($1, $2, $3::jsonb)", [randomUUID(), owner, { kind: "pantry", title: "Invalid stock", quantity: "bad" }]);
    const result = await readWorkspaceRundown(db, owner, "2027-03-16", "2027-03-17", { include: ["shopping", "thoughts"], currentDate: "2027-03-16" });
    expect(result.details?.pantry).toBeNull();
    expect(result.details?.groceries?.items.some(item => item.title === "Tea")).toBe(true);
    expect(result.details?.thoughts?.items.some(item => item.title === note.title)).toBe(true);
    expect(result.unavailable).toBeUndefined();
    expect((await readWorkspaceRundown(db, owner, "2027-03-16", "2027-03-17")).details).toBeUndefined();
  });

  it("computes current shopping from local-day sources without changing saved groceries", async () => {
    const [person] = await db.insert(schema.users).values({ phoneE164: "+12025550113" }).returning();
    const today = "2027-03-14";
    const oldMeal = randomUUID(), currentMeal = randomUUID(), pastGrocery = randomUUID(), pantry = randomUUID();
    await db.insert(schema.lifeItems).values([
      { id: oldMeal, userId: person.id, data: { kind: "meal", title: "Old plan", date: "2027-03-13", meal: "Dinner", ingredients: "500 g oats", groceriesEnabled: true } },
      { id: currentMeal, userId: person.id, data: { kind: "meal", title: "Current plan", date: today, meal: "Dinner", ingredients: "200 g rice", groceriesEnabled: true } },
      { id: pastGrocery, userId: person.id, data: { kind: "grocery", title: "Oats", quantity: 500, unit: "g", checked: false, mealSources: [{ mealId: oldMeal, quantity: 500 }] } },
      { id: randomUUID(), userId: person.id, data: { kind: "grocery", title: "Rice", quantity: 50, unit: "g", checked: true, mealSources: [{ mealId: currentMeal, quantity: 150 }] } },
      { id: pantry, userId: person.id, data: { kind: "pantry", title: "Rice", quantity: 100, unit: "g" } },
      { id: randomUUID(), userId: person.id, data: { kind: "grocery", title: "Tea", checked: true } },
    ]);
    const before = await db.select().from(schema.lifeItems).where(eq(schema.lifeItems.userId, person.id)).orderBy(schema.lifeItems.id);
    const result = await readWorkspaceRundown(db, person.id, "2027-03-13", today, { include: ["shopping"], currentDate: today });
    expect(result.details?.groceries).toEqual({ items: [
      { title: "Tea", checked: true, quantity: null, unit: null, mealDerived: false },
      { title: "rice", checked: false, quantity: 100, unit: "g", mealDerived: true },
    ], truncated: false });
    expect(result.details?.pantry).toEqual({ items: [{ title: "Rice", quantity: 100, unit: "g" }], truncated: false });
    expect(await db.select().from(schema.lifeItems).where(eq(schema.lifeItems.userId, person.id)).orderBy(schema.lifeItems.id)).toEqual(before);
  });
  it("rejects malformed and unbounded ranges", async () => {
    await expect(readWorkspaceRundown(db, owner, "2027-02-30", "2027-03-01")).rejects.toThrow();
    await expect(readWorkspaceRundown(db, owner, "2027-03-14", "2027-03-22")).rejects.toThrow();
    await expect(readWorkspaceRundown(db, owner, "2027-03-14", "2027-03-14")).rejects.toThrow();
  });
});
