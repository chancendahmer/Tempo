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
  it("rejects malformed and unbounded ranges", async () => {
    await expect(readWorkspaceRundown(db, owner, "2027-02-30", "2027-03-01")).rejects.toThrow();
    await expect(readWorkspaceRundown(db, owner, "2027-03-14", "2027-03-22")).rejects.toThrow();
    await expect(readWorkspaceRundown(db, owner, "2027-03-14", "2027-03-14")).rejects.toThrow();
  });
});
