import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import type { LifeItem } from "../../domain/life-items";
import { readActivityStreak } from "./activity-streak-repository";
import { mutateWorkspace, readWorkspace, WorkspaceConflict } from "./workspace-repository";
import { ensureDirectConversation } from "./messaging-identity-repository";

type Routine = Extract<LifeItem, { kind: "routine" }>;
const routine = (stepId = randomUUID()): Routine => ({ kind: "routine", title: "Easy morning", period: "morning", time: "08:00", steps: [{ id: stepId, title: "Water", minutes: 2, completedOn: null }] });

describe("account activity streak persistence", () => {
  let client: PGlite, db: TempoDatabase, migrationFiles: string[];
  let phone = 6500;
  beforeAll(async () => {
    migrationFiles = (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort();
    client = new PGlite();
    for (const file of migrationFiles) await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    db = drizzle(client, { schema }) as unknown as TempoDatabase;
  }, 30000);
  afterEach(() => vi.useRealTimers());
  afterAll(async () => client.close());

  async function account(timezone = "America/New_York") {
    return (await db.insert(schema.users).values({ phoneE164: `+1202555${phone++}`, timezone, onboardingState: "complete" }).returning())[0];
  }
  const clock = (value: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(value)); };

  it("returns an empty account's real zeroes without creating history during reads", async () => {
    const owner = await account();
    expect(await readActivityStreak(owner.id, db)).toMatchObject({ currentDays: 0, activeToday: false, completedToday: 0, latestActivityDay: null });
    expect((await readWorkspace(owner.id, db)).activityStreak.currentDays).toBe(0);
    expect(await db.select().from(schema.routineCompletions).where(eq(schema.routineCompletions.userId, owner.id))).toHaveLength(0);
  });

  it("uses only owned completed task audit events, dedupes recompletions, and retains progress after reopening", async () => {
    const owner = await account(), other = await account();
    const [task, foreign, statusOnly] = await db.insert(schema.tasks).values([
      { userId: owner.id, title: "Owned", status: "not_started" },
      { userId: other.id, title: "Private", status: "completed", completedAt: new Date("2026-10-19T04:01:00Z") },
      { userId: owner.id, title: "No completion audit", status: "completed", completedAt: new Date("2026-10-17T16:00:00Z") },
    ]).returning();
    const identity = await ensureDirectConversation(db, { userId: owner.id, phoneE164: owner.phoneE164 });
    const messages = await db.insert(schema.conversationMessages).values(Array.from({ length: 6 }, () => ({ userId: owner.id, conversationId: identity.conversationId, body: "test fixture", direction: "inbound" as const, kind: "system" as const, status: "processed" as const }))).returning();
    await db.insert(schema.taskEvents).values([
      { userId: owner.id, taskId: task.id, sourceMessageId: messages[0].id, eventType: "completed", createdAt: new Date("2026-10-19T03:59:00Z") },
      { userId: owner.id, taskId: task.id, sourceMessageId: messages[1].id, eventType: "completed", createdAt: new Date("2026-10-19T04:01:00Z") },
      { userId: owner.id, taskId: task.id, sourceMessageId: messages[2].id, eventType: "completed", createdAt: new Date("2026-10-19T04:02:00Z") },
      { userId: owner.id, taskId: task.id, sourceMessageId: messages[3].id, eventType: "started", createdAt: new Date("2026-10-17T16:00:00Z") },
      // Defense in depth: inconsistent ownership must not leak foreign activity.
      { userId: owner.id, taskId: foreign.id, sourceMessageId: messages[4].id, eventType: "completed", createdAt: new Date("2026-10-17T16:00:00Z") },
      { userId: other.id, taskId: statusOnly.id, sourceMessageId: messages[5].id, eventType: "completed", createdAt: new Date("2026-10-17T16:00:00Z") },
    ]);
    const summary = await readActivityStreak(owner.id, db, new Date("2026-10-19T04:15:00Z"));
    expect(summary).toMatchObject({ currentDays: 2, completedToday: 1, activeToday: true, latestActivityDay: "2026-10-19", totalActiveDays: 2, totalCompletions: 2, bestDays: 2 });
    expect(summary.recentDays.find(day => day.date === "2026-10-17")?.active).toBe(false);
    expect(await readActivityStreak(other.id, db, new Date("2026-10-19T04:15:00Z"))).toMatchObject({ currentDays: 0, totalActiveDays: 0, totalCompletions: 0, bestDays: 0 });
  });

  it("counts a task command retry once and keeps its recorded completion after an explicit reopen", async () => {
    const owner = await account();
    await mutateWorkspace(owner.id, { action: "task", requestId: randomUUID(), command: { type: "create_task", title: "One small step" } }, db);
    const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.userId, owner.id));
    const completion = { action: "task" as const, requestId: randomUUID(), command: { type: "complete_task" as const, taskId: task.id } };
    await mutateWorkspace(owner.id, completion, db);
    await mutateWorkspace(owner.id, completion, db);
    expect((await readActivityStreak(owner.id, db)).completedToday).toBe(1);
    await mutateWorkspace(owner.id, { action: "task", requestId: randomUUID(), command: { type: "reopen_task", taskId: task.id } }, db);
    expect((await readActivityStreak(owner.id, db)).completedToday).toBe(1);
  });

  it("records checkoffs once, undoes today's completion, and retains earlier routine days across new days and deletion", async () => {
    clock("2026-10-18T12:00:00Z");
    const owner = await account(), other = await account(), id = randomUUID(), original = routine();
    await mutateWorkspace(owner.id, { action: "save", id, version: 0, data: original }, db);
    const checked: Routine = { ...original, steps: original.steps.map(step => ({ ...step, completedOn: "2026-10-18" })) };
    const firstCheck = { action: "save" as const, id, version: 1, data: checked };
    await expect(mutateWorkspace(other.id, firstCheck, db)).rejects.toThrow(WorkspaceConflict);
    await mutateWorkspace(owner.id, firstCheck, db);
    await mutateWorkspace(owner.id, firstCheck, db);
    expect(await readActivityStreak(owner.id, db)).toMatchObject({ currentDays: 1, completedToday: 1 });
    await mutateWorkspace(owner.id, { action: "save", id, version: 2, data: original }, db);
    expect(await readActivityStreak(owner.id, db)).toMatchObject({ currentDays: 0, completedToday: 0 });
    await mutateWorkspace(owner.id, { action: "save", id, version: 3, data: checked }, db);
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    const nextDay: Routine = { ...original, steps: original.steps.map(step => ({ ...step, completedOn: "2026-10-19" })) };
    await mutateWorkspace(owner.id, { action: "save", id, version: 4, data: nextDay }, db);
    expect(await readActivityStreak(owner.id, db)).toMatchObject({ currentDays: 2, completedToday: 1 });
    await mutateWorkspace(owner.id, { action: "delete", id, version: 5 }, db);
    expect(await readActivityStreak(owner.id, db)).toMatchObject({ currentDays: 2, completedToday: 1 });
    expect(await db.select().from(schema.routineCompletions).where(eq(schema.routineCompletions.userId, owner.id))).toHaveLength(2);
    expect((await readActivityStreak(other.id, db)).completedToday).toBe(0);
  });

  it("undoes a repeated daily checkoff without restoring yesterday's date or erasing yesterday's history", async () => {
    clock("2026-10-18T12:00:00Z");
    const owner = await account(), id = randomUUID(), original = routine();
    await mutateWorkspace(owner.id, { action: "save", id, version: 0, data: original }, db);
    const yesterday: Routine = { ...original, steps: original.steps.map(step => ({ ...step, completedOn: "2026-10-18" })) };
    await mutateWorkspace(owner.id, { action: "save", id, version: 1, data: yesterday }, db);
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    const today: Routine = { ...original, steps: original.steps.map(step => ({ ...step, completedOn: "2026-10-19" })) };
    await mutateWorkspace(owner.id, { action: "save", id, version: 2, data: today }, db);
    expect(await readActivityStreak(owner.id, db)).toMatchObject({ currentDays: 2, completedToday: 1 });
    // Match the UI Undo payload: reverse today's checkoff, preserving past
    // progress in the ledger rather than writing a historical snapshot back.
    const undo = { action: "save" as const, id, version: 3, data: original };
    await mutateWorkspace(owner.id, undo, db);
    await mutateWorkspace(owner.id, undo, db);
    expect(await readActivityStreak(owner.id, db)).toMatchObject({ currentDays: 1, activeToday: false, completedToday: 0, latestActivityDay: "2026-10-18" });
    expect((await db.select().from(schema.routineCompletions).where(eq(schema.routineCompletions.userId, owner.id))).map(row => row.completedOn)).toEqual(["2026-10-18"]);
    expect((await db.select().from(schema.lifeItems).where(eq(schema.lifeItems.id, id)))[0].data).toEqual(original);
    await mutateWorkspace(owner.id, { action: "save", id, version: 4, data: today }, db);
    expect(await readActivityStreak(owner.id, db)).toMatchObject({ currentDays: 2, activeToday: true, completedToday: 1 });
  });

  it("rejects new backdated/future checkoffs atomically and preserves unchanged observed dates", async () => {
    clock("2026-10-19T04:15:00Z");
    const owner = await account(), id = randomUUID(), data = routine();
    await mutateWorkspace(owner.id, { action: "save", id, version: 0, data }, db);
    for (const completedOn of ["2026-10-18", "2026-10-20"]) {
      await expect(mutateWorkspace(owner.id, { action: "save", id, version: 1, data: { ...data, steps: data.steps.map(step => ({ ...step, completedOn })) } }, db)).rejects.toThrow("current local day");
    }
    expect((await db.select().from(schema.lifeItems).where(eq(schema.lifeItems.id, id)))[0].version).toBe(1);
    expect((await readActivityStreak(owner.id, db)).completedToday).toBe(0);
    const legacy = { ...data, steps: data.steps.map(step => ({ ...step, completedOn: "2026-10-15" })) };
    await db.update(schema.lifeItems).set({ data: legacy }).where(eq(schema.lifeItems.id, id));
    await mutateWorkspace(owner.id, { action: "save", id, version: 1, data: { ...legacy, title: "Renamed" } }, db);
    expect((await readActivityStreak(owner.id, db)).currentDays).toBe(0);
  });

  it("records a focused routine step in the same transaction and ignores stopped or stale sessions", async () => {
    clock("2026-10-19T04:15:00Z");
    const owner = await account(), id = randomUUID(), focusId = randomUUID(), data = routine();
    await mutateWorkspace(owner.id, { action: "save", id, version: 0, data }, db);
    await mutateWorkspace(owner.id, { action: "save", id: focusId, version: 0, data: { kind: "focus", title: "Water", routineId: id, stepId: data.steps[0].id, endsAt: null, remaining: 60 } }, db);
    await expect(mutateWorkspace(owner.id, { action: "finish_focus", id: focusId, version: 2 }, db)).rejects.toThrow(WorkspaceConflict);
    expect((await readActivityStreak(owner.id, db)).completedToday).toBe(0);
    await mutateWorkspace(owner.id, { action: "finish_focus", id: focusId, version: 1 }, db);
    await expect(mutateWorkspace(owner.id, { action: "finish_focus", id: focusId, version: 1 }, db)).rejects.toThrow(WorkspaceConflict);
    expect((await readActivityStreak(owner.id, db)).completedToday).toBe(1);
    const another = randomUUID();
    await mutateWorkspace(owner.id, { action: "save", id: another, version: 0, data: { kind: "focus", title: "Water", routineId: id, stepId: data.steps[0].id, endsAt: null, remaining: 60 } }, db);
    await mutateWorkspace(owner.id, { action: "stop_focus", requestId: randomUUID(), focus: { id: another, version: 1 } }, db);
    expect((await readActivityStreak(owner.id, db)).completedToday).toBe(1);
  });

  it("backfills only actual observed saved dates without inventing a routine's earlier history", async () => {
    const legacyClient = new PGlite();
    try {
      for (const file of migrationFiles.filter(file => file !== "0030_routine_completions.sql")) await legacyClient.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
      const legacyDb = drizzle(legacyClient, { schema }) as unknown as TempoDatabase;
      const [owner] = await legacyDb.insert(schema.users).values({ phoneE164: "+12025556999", timezone: "America/New_York" }).returning();
      const data = routine();
      await legacyDb.insert(schema.lifeItems).values({ id: randomUUID(), userId: owner.id, createdAt: new Date("2020-01-01T12:00:00Z"), data: { ...data, steps: [{ ...data.steps[0], completedOn: "2026-01-15" }, { id: randomUUID(), title: "Not completed", minutes: 2, completedOn: null }, { id: randomUUID(), title: "Future value", minutes: 2, completedOn: "2099-01-15" }] } });
      await legacyClient.exec((await readFile(resolve("drizzle", "0030_routine_completions.sql"), "utf8")).replaceAll("--> statement-breakpoint", ""));
      const rows = await legacyDb.select().from(schema.routineCompletions);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId: owner.id, completedOn: "2026-01-15" });
      expect(await readActivityStreak(owner.id, legacyDb, new Date("2026-01-16T12:00:00Z"))).toMatchObject({ currentDays: 1, completedToday: 0, latestActivityDay: "2026-01-15" });
    } finally { await legacyClient.close(); }
  }, 30000);
});
