import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { mutateWorkspace, readWorkspace } from "./workspace-repository";
import { LifeAssistant } from "./life-assistant";
import { localDay, type LifeItem } from "../../domain/life-items";

describe("completed workout persistence", () => {
  let client: PGlite, db: TempoDatabase, owner: string;
  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    db = drizzle(client, { schema }) as unknown as TempoDatabase;
    [owner] = (await db.insert(schema.users).values({ phoneE164: "+12025550695", timezone: "Pacific/Kiritimati" }).returning()).map(user => user.id);
  }, 30000);
  afterAll(async () => client.close());
  const workout: Extract<LifeItem, { kind: "workout" }> = { kind: "workout", title: "Completed walk", date: "2000-01-01", minutes: 20, activity: "Walk" };

  it("refuses future completed logs from the workspace and assistant without saving a record", async () => {
    const tomorrow = localDay(new Date(Date.now() + 86400000), "Pacific/Kiritimati");
    const data = { ...workout, date: tomorrow };
    await expect(mutateWorkspace(owner, { action: "save", id: randomUUID(), version: 0, data }, db)).rejects.toThrow("today or an earlier date");
    const assistant = new LifeAssistant(db);
    expect(await assistant.execute(owner, randomUUID(), { type: "life_save", data })).toContain("today or an earlier date");
    expect((await readWorkspace(owner, db)).items).toHaveLength(0);
  });

  it("uses account-local today, keeps retries idempotent, and rejects future edits atomically", async () => {
    const id = randomUUID(), date = localDay(new Date(), "Pacific/Kiritimati");
    const save = { action: "save" as const, id, version: 0, data: { ...workout, date } };
    await mutateWorkspace(owner, save, db);
    await mutateWorkspace(owner, save, db);
    await mutateWorkspace(owner, { action: "patch", id, version: 1, patch: { kind: "workout", notes: "A short break" } }, db);
    const tomorrow = localDay(new Date(Date.now() + 86400000), "Pacific/Kiritimati");
    await expect(mutateWorkspace(owner, { action: "save", id, version: 2, data: { ...workout, date: tomorrow } }, db)).rejects.toThrow("today or an earlier date");
    const assistant = new LifeAssistant(db);
    expect(await assistant.execute(owner, randomUUID(), { type: "life_patch", id, version: 2, patch: { kind: "workout", date: tomorrow } })).toContain("today or an earlier date");
    expect((await readWorkspace(owner, db)).items).toEqual([expect.objectContaining({ id, version: 2, data: { ...workout, date, notes: "A short break" } })]);
  });

  it("keeps a saved plan, a future scheduled task, and an actual completed log separate", async () => {
    const [person] = await db.insert(schema.users).values({ phoneE164: "+12025550696" }).returning();
    const planId = randomUUID(), session = { name: "Easy walk", minutes: 30, exercises: [{ name: "Walk", dose: "30 minutes" }] };
    await mutateWorkspace(person.id, { action: "save", id: planId, version: 0, data: { kind: "workout_plan", title: "My movement", templateId: "walking-mobility", sessions: [session] } }, db);
    const dueAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const schedule = { action: "task" as const, requestId: randomUUID(), command: { type: "create_task" as const, title: `My movement · ${session.name}`, estimatedMinutes: session.minutes, dueAt } };
    await mutateWorkspace(person.id, schedule, db);
    await mutateWorkspace(person.id, schedule, db);
    let workspace = await readWorkspace(person.id, db);
    expect(workspace.tasks).toHaveLength(1);
    expect(workspace.tasks[0]).toMatchObject({ status: "not_started", estimatedMinutes: 30, dueAt: new Date(dueAt) });
    expect(workspace.items.map(item => item.data.kind)).toEqual(["workout_plan"]);
    const assistant = new LifeAssistant(db), source = randomUUID();
    const completed = { type: "life_save" as const, data: { ...workout, programId: planId, sessionName: session.name, minutes: 18 } };
    await assistant.execute(person.id, source, completed);
    await assistant.execute(person.id, source, completed);
    workspace = await readWorkspace(person.id, db);
    expect(workspace.items.filter(item => item.data.kind === "workout")).toEqual([expect.objectContaining({ data: completed.data })]);
    expect(workspace.tasks[0].status).toBe("not_started");
    expect(workspace.items.find(item => item.id === planId)?.data).toMatchObject({ sessions: [session] });
  });
});
