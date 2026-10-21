import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { mutateWorkspace, readWorkspace } from "./workspace-repository";
import { enrichTaskPresentations } from "./task-presentation-repository";
import { readHomePreferences } from "../../domain/home-preferences";

describe("adaptive Home saved account state", () => {
  let client: PGlite, db: TempoDatabase, owner: string, other: string;
  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve("drizzle"))).filter(file => /^\d+.*\.sql$/.test(file)).sort()) await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    db = drizzle(client, { schema }) as unknown as TempoDatabase;
    [owner, other] = (await db.insert(schema.users).values([{ phoneE164: "+12025550701", workspacePreferences: { existing: "keep" } }, { phoneE164: "+12025550702" }]).returning()).map(row => row.id);
  }, 30000);
  afterAll(async () => client.close());
  async function create(userId: string, title: string) {
    await mutateWorkspace(userId, { action: "task", requestId: randomUUID(), command: { type: "create_task", title } }, db);
    return (await readWorkspace(userId, db)).tasks.find(task => task.title === title)!;
  }
  it("persists banner preferences without changing consent, unrelated preferences, or another account", async () => {
    const initial = readHomePreferences({});
    const preferences = { ...initial, morningTime: "09:00", dinnerTime: "19:30", pinned: "meal" as const };
    await mutateWorkspace(owner, { action: "home_preferences", preferences, expected: initial }, db);
    expect((await readWorkspace(owner, db)).homePreferences).toEqual(preferences);
    expect((await readWorkspace(other, db)).homePreferences).toEqual(initial);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, owner));
    expect(user.workspacePreferences.existing).toBe("keep");
    expect(user.proactiveOptIn).toBe(false);
    await expect(mutateWorkspace(owner, { action: "home_preferences", expected: initial, preferences: initial }, db)).rejects.toThrow("another tab");
  });
  it("stores an override only on the owned current task; starts its chosen duration atomically and idempotently", async () => {
    const task = await create(owner, "Buy groceries for dinner");
    const action = { action: "task_presentation" as const, taskId: task.id, expectedTitle: task.title, category: "shopping" as const, focusMinutes: 7 };
    await expect(mutateWorkspace(other, action, db)).rejects.toThrow();
    await expect(mutateWorkspace(owner, { ...action, expectedTitle: "Old title" }, db)).rejects.toThrow();
    await mutateWorkspace(owner, action, db);
    expect((await readWorkspace(owner, db)).tasks.find(row => row.id === task.id)?.presentation).toMatchObject({ source: "manual", focusMinutes: 7, category: "shopping" });
    const start = { action: "task" as const, requestId: randomUUID(), command: { type: "start_task" as const, taskId: task.id }, focusMinutes: 7 };
    await mutateWorkspace(owner, start, db);
    const first = (await readWorkspace(owner, db)).items.find(item => item.data.kind === "focus")!;
    expect(first.data).toMatchObject({ taskId: task.id, remaining: 420 });
    await mutateWorkspace(owner, start, db);
    const second = (await readWorkspace(owner, db)).items.filter(item => item.data.kind === "focus");
    expect(second).toEqual([first]);
    await expect(mutateWorkspace(owner, { ...start, focusMinutes: 12 }, db)).rejects.toThrow();
    await expect(mutateWorkspace(owner, action, db)).rejects.toThrow("already running");
    expect((await readWorkspace(other, db)).items).toHaveLength(0);
    await mutateWorkspace(owner, { action: "task", requestId: randomUUID(), command: { type: "complete_task", taskId: task.id } }, db);
    expect((await readWorkspace(owner, db)).items.filter(item => item.data.kind === "focus")).toHaveLength(0);
  });
  it("enriches one account at a time and preserves manual edits made while the model is working", async () => {
    const task = await create(owner, "Outline a presentation about nutrition");
    const neighbor = await create(other, "Outline a presentation about nutrition");
    const result = await enrichTaskPresentations(async input => {
      expect(input.map(row => row.id)).toEqual([task.id]);
      expect(input[0]).toEqual({ id: task.id, title: task.title, estimatedMinutes: null });
      await mutateWorkspace(owner, { action: "task_presentation", taskId: task.id, expectedTitle: task.title, category: "work", focusMinutes: 8 }, db);
      return { tasks: [{ id: task.id, category: "food", focusMinutes: 60 }] };
    }, db);
    expect(result.saved).toBe(0);
    expect((await readWorkspace(owner, db)).tasks.find(row => row.id === task.id)?.presentation).toMatchObject({ source: "manual", category: "work", focusMinutes: 8 });
    expect((await readWorkspace(other, db)).tasks.find(row => row.id === neighbor.id)?.presentation).toBeNull();
    await enrichTaskPresentations(async input => ({ tasks: input.map(row => ({ id: row.id, category: "work", focusMinutes: 10 })) }), db);
    expect((await readWorkspace(other, db)).tasks.find(row => row.id === neighbor.id)?.presentation).toMatchObject({ source: "ai", category: "work", focusMinutes: 10 });
  });
  it("does not overwrite a title correction and settles provider failures without repeated paid retries", async () => {
    const task = await create(owner, "Cook some soup");
    await enrichTaskPresentations(async () => {
      await mutateWorkspace(owner, { action: "task", requestId: randomUUID(), command: { type: "update_task", taskId: task.id, patch: { title: "Write an essay about soup" } } }, db);
      return { tasks: [{ id: task.id, category: "food", focusMinutes: 15 }] };
    }, db);
    expect((await readWorkspace(owner, db)).tasks.find(row => row.id === task.id)?.presentation).toBeNull();
    let calls = 0;
    const fail = async () => { calls++; throw new Error("Provider unavailable"); };
    expect(await enrichTaskPresentations(fail, db)).toMatchObject({ source: "fallback", saved: 1 });
    expect(await enrichTaskPresentations(fail, db)).toMatchObject({ source: "none", saved: 0 });
    expect(calls).toBe(1);
    expect((await readWorkspace(owner, db)).tasks.find(row => row.id === task.id)?.presentation).toMatchObject({ source: "fallback", category: "work" });
  });
});
