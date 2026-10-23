import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { TempoDatabase } from "../client";
import * as schema from "../schema";
import { taskPresentation } from "../../domain/task-presentation";
import { ensureDirectConversation } from "./messaging-identity-repository";
import { mutateWorkspace, readWorkspace } from "./workspace-repository";
import { DrizzleTaskRepository } from "./task-repository";
import { enrichTaskPresentations } from "./task-presentation-repository";

let client: PGlite, db: TempoDatabase, userId: string, conversationId: string;
beforeAll(async () => {
  client = new PGlite();
  for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
  db = drizzle(client, { schema }) as unknown as TempoDatabase;
  const [user] = await db.insert(schema.users).values({ phoneE164: "+12025550187", phoneVerifiedAt: new Date(), onboardingState: "complete" }).returning();
  userId = user.id;
  conversationId = (await ensureDirectConversation(db, { userId, phoneE164: user.phoneE164 })).conversationId;
}, 30000);
beforeEach(async () => { await db.delete(schema.tasks).where(eq(schema.tasks.userId, userId)); });
afterAll(async () => { await client.close(); });
async function task(estimatedMinutes: number | null, source?: "ai" | "fallback" | "manual") {
  const [row] = await db.insert(schema.tasks).values({ userId, title: "Write outline", estimatedMinutes, presentation: source ? { title: "Write outline", source, category: "work", focusMinutes: 20 } : null }).returning();
  return row;
}
async function change(id: string, changes: { estimatedMinutes?: number | null; title?: string }) {
  const [message] = await db.insert(schema.conversationMessages).values({ userId, conversationId, direction: "inbound", kind: "user", status: "received", body: "Synthetic duration correction" }).returning();
  return new DrizzleTaskRepository(db).mutate({ userId, taskId: id, sourceMessageId: message.id, eventType: "updated", changes });
}

it.each(["ai", "fallback"] as const)("normal workspace duration edits invalidate a saved %s timer and fresh reads use the new estimate", async source => {
  const original = await task(30, source);
  await mutateWorkspace(userId, { action: "task", requestId: randomUUID(), command: { type: "update_task", taskId: original.id, patch: { estimatedMinutes: 2 } } }, db);
  const [stored] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, original.id));
  expect(stored).toMatchObject({ estimatedMinutes: 2, presentation: null });
  const saved = (await readWorkspace(userId, db)).tasks.find(row => row.id === original.id)!;
  expect(taskPresentation(saved)).toMatchObject({ focusMinutes: 2, source: "fallback" });
  expect((await db.select().from(schema.taskEvents).where(eq(schema.taskEvents.taskId, original.id)))[0].changes).toMatchObject({ estimatedMinutes: 2 });
});

it("preserves manual preferences and automatic metadata when inputs did not change; invalidates clearing an estimate", async () => {
  const manual = await task(30, "manual"); await change(manual.id, { title: "Renamed outline", estimatedMinutes: 2 });
  expect((await db.select().from(schema.tasks).where(eq(schema.tasks.id, manual.id)))[0].presentation).toEqual(manual.presentation);
  const automatic = await task(30, "ai"); await change(automatic.id, { title: automatic.title, estimatedMinutes: 30 });
  expect((await db.select().from(schema.tasks).where(eq(schema.tasks.id, automatic.id)))[0].presentation).toEqual(automatic.presentation);
  await change(automatic.id, { estimatedMinutes: null });
  expect((await db.select().from(schema.tasks).where(eq(schema.tasks.id, automatic.id)))[0].presentation).toBeNull();
});

it.each([{ before: 30, after: 2 }, { before: null, after: 5 }, { before: 2, after: 30 }, { before: 30, after: null }])("never saves an in-flight AI suggestion after estimate $before becomes $after", async ({ before, after }) => {
  const original = await task(before);
  const stale = await enrichTaskPresentations(async pending => {
    expect(pending).toEqual([{ id: original.id, title: original.title, estimatedMinutes: before }]);
    await change(original.id, { estimatedMinutes: after });
    return { tasks: [{ id: original.id, category: "work", focusMinutes: 20 }] };
  }, db);
  expect(stale.saved).toBe(0);
  expect((await db.select().from(schema.tasks).where(eq(schema.tasks.id, original.id)))[0]).toMatchObject({ estimatedMinutes: after, presentation: null });
  const fresh = await enrichTaskPresentations(async pending => {
    expect(pending[0].estimatedMinutes).toBe(after);
    return { tasks: [{ id: original.id, category: "work", focusMinutes: 20 }] };
  }, db);
  expect(fresh).toEqual({ saved: 1, source: "ai" });
  expect((await db.select().from(schema.tasks).where(eq(schema.tasks.id, original.id)))[0].presentation).toMatchObject({ source: "ai", focusMinutes: Math.min(20, after ?? 60) });
});

it("does not save stale deterministic fallback after an unavailable model and an intervening duration edit", async () => {
  const original = await task(30);
  expect(await enrichTaskPresentations(async () => { await change(original.id, { estimatedMinutes: 2 }); throw new Error("Synthetic unavailable model"); }, db)).toEqual({ saved: 0, source: "fallback" });
  expect((await db.select().from(schema.tasks).where(eq(schema.tasks.id, original.id)))[0].presentation).toBeNull();
});

it("preserves a manual timer chosen while automatic enrichment was in flight", async () => {
  const original = await task(30);
  expect(await enrichTaskPresentations(async () => {
    await mutateWorkspace(userId, { action: "task_presentation", taskId: original.id, expectedTitle: original.title, category: "work", focusMinutes: 7 }, db);
    return { tasks: [{ id: original.id, category: "work", focusMinutes: 20 }] };
  }, db)).toEqual({ saved: 0, source: "ai" });
  expect((await db.select().from(schema.tasks).where(eq(schema.tasks.id, original.id)))[0].presentation).toMatchObject({ source: "manual", focusMinutes: 7 });
});
