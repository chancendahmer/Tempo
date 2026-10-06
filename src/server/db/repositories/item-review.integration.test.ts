import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { TempoDatabase } from "../client";
import * as s from "../schema";
import { DrizzleItemReviewRepository } from "./item-review-repository";
import { DrizzleContextEngineRepository } from "./context-engine-repository";
import { DrizzleMemoryRepository } from "./memory-repository";
import { DrizzleReminderRepository } from "./reminder-repository";
import { DrizzleOutboundMessageRepository } from "./outbound-message-repository";
import { ensureDirectConversation } from "./messaging-identity-repository";
import { mutateWorkspace, readWorkspace } from "./workspace-repository";
import { DAY_MS, reviewIsDue } from "../../domain/item-review";
import { deliverItemReview } from "../../domain/item-review-delivery";
import { MemoryService } from "../../domain/memory-service";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { TestSmsTransport } from "../../adapters/sms/sms-transport";

let client: PGlite, db: TempoDatabase;
const now = new Date("2026-10-06T16:00:00Z"), old = new Date(now.getTime() - 20 * DAY_MS);
let phone = 200;
beforeAll(async () => {
  client = new PGlite();
  for (const file of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
  db = drizzle(client, { schema: s }) as unknown as TempoDatabase;
}, 30000);
afterAll(async () => client.close());
async function account() {
  const [user] = await db.insert(s.users).values({ phoneE164: `+12025553${phone++}`, timezone: "UTC", onboardingState: "complete", proactiveOptIn: true, status: "active", quietHoursStart: "22:00", quietHoursEnd: "07:00" }).returning();
  await db.insert(s.consentRecords).values({ userId: user.id, status: "granted", channel: "web", disclosureVersion: "test", termsVersion: "test", privacyVersion: "test", createdAt: old });
  await db.insert(s.calendarConnections).values({ userId: user.id, lastSyncedAt: now });
  const identity = await ensureDirectConversation(db, { userId: user.id, phoneE164: user.phoneE164 });
  const repo = new DrizzleItemReviewRepository(db);
  return { user, repo, conversationId: identity.conversationId };
}
async function staleTask(userId: string) { return (await db.insert(s.tasks).values({ userId, title: "Call the dentist", dueAt: old, createdAt: old, updatedAt: old }).returning())[0]; }
async function showReview(a: Awaited<ReturnType<typeof account>>) {
  const review = await a.repo.reserve(a.user.id, now);
  expect(review).not.toBeNull();
  const [message] = await db.insert(s.conversationMessages).values({ userId: a.user.id, conversationId: a.conversationId, direction: "outbound", kind: "coach", status: "sent", body: "Still needed? KEEP, REMOVE or LATER", idempotencyKey: randomUUID(), createdAt: now }).returning();
  await a.repo.finish(review!.id, message.id, now);
  return review!;
}
async function answer(a: Awaited<ReturnType<typeof account>>, body: string) {
  return (await db.insert(s.conversationMessages).values({ userId: a.user.id, conversationId: a.conversationId, direction: "inbound", kind: "user", status: "received", body, idempotencyKey: randomUUID(), createdAt: new Date(now.getTime() + 1000) }).returning())[0];
}

it("shows undated tasks, memories and old reminders only in their owner's workspace; removal is durable", async () => {
  const a = await account(), other = await account();
  await db.insert(s.tasks).values({ userId: a.user.id, title: "Undated task" });
  const [memory] = await db.insert(s.memoryEntries).values({ userId: a.user.id, category: "preference", content: "I like gentle check-ins" }).returning();
  const [reminder] = await db.insert(s.reminders).values({ userId: a.user.id, text: "Old reminder", remindAt: old, timezone: "UTC", status: "sent", idempotencyKey: randomUUID() }).returning();
  const view = await readWorkspace(a.user.id, db);
  expect(view.tasks.some(row => row.title === "Undated task")).toBe(true);
  expect(view.memories).toEqual([expect.objectContaining({ id: memory.id })]);
  expect(view.reminders).toEqual([expect.objectContaining({ id: reminder.id })]);
  expect((await readWorkspace(other.user.id, db)).memories).toEqual([]);
  await expect(mutateWorkspace(other.user.id, { action: "forget_memory", id: memory.id, expectedContent: memory.content }, db)).rejects.toThrow("unavailable");
  await expect(mutateWorkspace(other.user.id, { action: "remove_reminder", id: reminder.id }, db)).rejects.toThrow("unavailable");
  await expect(mutateWorkspace(a.user.id, { action: "forget_memory", id: memory.id, expectedContent: "wrong" }, db)).rejects.toThrow("changed");
  const action = { action: "forget_memory" as const, id: memory.id, expectedContent: memory.content };
  await mutateWorkspace(a.user.id, action, db); await mutateWorkspace(a.user.id, action, db);
  await mutateWorkspace(a.user.id, { action: "remove_reminder", id: reminder.id }, db);
  expect((await readWorkspace(a.user.id, db)).memories).toEqual([]);
  expect((await readWorkspace(a.user.id, db)).reminders).toEqual([]);
  expect(await new DrizzleMemoryRepository(db).retrieveRelevant(a.user.id, now, 20)).toEqual([]);
});

it("forget-by-ID requires ownership and fresh content; vague corrections never erase the latest fact", async () => {
  const a = await account(), other = await account(), repo = new DrizzleMemoryRepository(db);
  const [memory] = await db.insert(s.memoryEntries).values({ userId: a.user.id, category: "fact", content: "Keys in blue bowl" }).returning();
  expect(await repo.forgetById(other.user.id, memory.id, memory.content, now)).toBe(false);
  expect(await repo.forgetById(a.user.id, memory.id, "Old content", now)).toBe(false);
  const service = new MemoryService(repo);
  expect(await service.tryHandleCorrection({ userId: a.user.id, messageId: randomUUID(), body: "that's not true", now }, async () => true)).toContain("Which saved memory");
  expect(await repo.forgetById(a.user.id, memory.id, memory.content, now)).toBe(true);
  expect(await repo.searchRelevant(a.user.id, now, "Keys", 20)).toEqual([]);
});

it("removes sent and failed reminders but never another account or an in-flight reminder", async () => {
  const a = await account(), other = await account(), repo = new DrizzleReminderRepository(db);
  for (const status of ["sent", "failed", "sending"] as const) {
    const [row] = await db.insert(s.reminders).values({ userId: a.user.id, text: "Call doctor", status, remindAt: old, timezone: "UTC", idempotencyKey: randomUUID() }).returning();
    expect((await repo.cancel({ userId: other.user.id, reminderId: row.id, now })).kind).toBe("not_found");
    expect((await repo.cancel({ userId: a.user.id, reminderId: row.id, now })).kind).toBe(status === "sending" ? "not_found" : "cancelled");
  }
});

it.each(["keep", "later", "remove"])("a %s reply changes only the reviewed task, and retries are idempotent", async choice => {
  const a = await account(), other = await account();
  const task = await staleTask(a.user.id), foreign = await staleTask(other.user.id);
  const review = await showReview(a);
  const inbound = await answer(a, choice);
  const reply = await a.repo.respond(a.user.id, inbound.id, choice, new Date(now.getTime() + 1000));
  expect(reply).toBeTruthy();
  expect(await a.repo.respond(a.user.id, inbound.id, choice, now)).toBe(reply);
  const [row] = await db.select().from(s.tasks).where(eq(s.tasks.id, task.id));
  expect(row.status).toBe(choice === "remove" ? "abandoned" : "not_started");
  expect((await db.select().from(s.tasks).where(eq(s.tasks.id, foreign.id)))[0].status).toBe("not_started");
  expect((await db.select().from(s.itemReviews).where(eq(s.itemReviews.id, review.id)))[0].status).toBe("closed");
  expect(await a.repo.reserve(a.user.id, now)).toBeNull();
});

it("ignoring a check-in never deletes; changed items and unrelated interruptions cannot be removed by a bare reply", async () => {
  for (const scenario of ["changed", "interrupted", "ignored", "foreign"] as const) {
    const a = await account(), task = await staleTask(a.user.id);
    await showReview(a);
    if (scenario === "changed") await db.update(s.tasks).set({ title: "Updated plan", updatedAt: now }).where(eq(s.tasks.id, task.id));
    if (scenario === "interrupted") await db.insert(s.conversationMessages).values({ userId: a.user.id, conversationId: a.conversationId, direction: "outbound", kind: "coach", status: "sent", body: "Unrelated reminder", idempotencyKey: randomUUID(), createdAt: new Date(now.getTime() + 500) });
    const inbound = await answer(a, "REMOVE");
    const reply = await a.repo.respond(scenario === "foreign" ? (await account()).user.id : a.user.id, inbound.id, scenario === "ignored" ? "Hi" : "REMOVE", now);
    expect(reply).toEqual(scenario === "changed" ? expect.stringContaining("changed") : null);
    expect((await db.select().from(s.tasks).where(eq(s.tasks.id, task.id)))[0].status).toBe("not_started");
  }
});

it.each(["goal", "reminder", "life"] as const)("reviews and removes an old %s using the normal account-scoped mutation", async kind => {
  const a = await account();
  if (kind === "goal") await db.insert(s.goals).values({ userId: a.user.id, title: "Learn pottery", createdAt: old, updatedAt: old });
  if (kind === "reminder") await db.insert(s.reminders).values({ userId: a.user.id, text: "Book dentist", status: "sent", remindAt: old, timezone: "UTC", idempotencyKey: randomUUID(), createdAt: old, updatedAt: old });
  if (kind === "life") await db.insert(s.lifeItems).values({ id: randomUUID(), userId: a.user.id, data: { kind: "note", title: "Look into pottery", body: "Find a class" }, createdAt: old, updatedAt: old });
  const review = await showReview(a);
  expect(review.target.kind).toBe(kind);
  const inbound = await answer(a, "REMOVE");
  expect(await a.repo.respond(a.user.id, inbound.id, "REMOVE", now)).toBeTruthy();
  const workspace = await readWorkspace(a.user.id, db);
  expect(kind === "goal" ? workspace.goals : kind === "reminder" ? workspace.reminders : workspace.items).toEqual([]);
});

it.each(["optout", "quiet", "paused", "busy", "stale-calendar", "consent", "cap", "recent-chat"])("blocks stale-item outreach for %s", async reason => {
  const a = await account(); await staleTask(a.user.id);
  if (reason === "optout") await db.update(s.users).set({ proactiveOptIn: false }).where(eq(s.users.id, a.user.id));
  if (reason === "quiet") await db.update(s.users).set({ quietHoursStart: "15:00", quietHoursEnd: "17:00" }).where(eq(s.users.id, a.user.id));
  if (reason === "paused") await db.update(s.users).set({ status: "paused" }).where(eq(s.users.id, a.user.id));
  if (reason === "stale-calendar") await db.update(s.calendarConnections).set({ lastSyncedAt: old }).where(eq(s.calendarConnections.userId, a.user.id));
  if (reason === "consent") await db.delete(s.consentRecords).where(eq(s.consentRecords.userId, a.user.id));
  if (reason === "cap") await db.update(s.users).set({ dailyInterventionCap: 0 }).where(eq(s.users.id, a.user.id));
  if (reason === "recent-chat") await answer(a, "Hello");
  if (reason === "busy") {
    const [connection] = await db.select().from(s.calendarConnections).where(eq(s.calendarConnections.userId, a.user.id));
    await db.insert(s.calendarBusyWindows).values({ userId: a.user.id, connectionId: connection.id, startsAt: new Date(now.getTime() - 60000), endsAt: new Date(now.getTime() + 60000), sourceHash: randomUUID() });
  }
  expect(await a.repo.reserve(a.user.id, now)).toBeNull();
});

it("resumes one reservation after restart, sends once, and shares contact counts with normal coaching", async () => {
  const a = await account(); await staleTask(a.user.id);
  const reserved = await a.repo.reserve(a.user.id, now);
  expect((await new DrizzleItemReviewRepository(db).reserve(a.user.id, now))?.id).toBe(reserved?.id);
  const transport = new TestSmsTransport("REVIEWS");
  const sender = new SafeSmsSender(new DrizzleOutboundMessageRepository(db), transport, () => now);
  const finish = vi.spyOn(a.repo, "finish").mockRejectedValueOnce(new Error("Worker crashed after accepted send"));
  const input = { userId: a.user.id, enabled: true, repository: a.repo, sender, now: () => now, runOwned: async <T>(operation: () => Promise<T>) => operation() };
  await expect(deliverItemReview(input)).rejects.toThrow("Worker crashed");
  finish.mockRestore();
  await deliverItemReview({ ...input, repository: new DrizzleItemReviewRepository(db) });
  expect(transport.sent).toHaveLength(1);
  const signals = await new DrizzleContextEngineRepository(db).loadSignals(a.user.id, now);
  expect(signals?.dailyInterventionCount).toBe(1);
  expect(signals?.hasPendingResponse).toBe(true);
  expect(await a.repo.reserve(a.user.id, now)).toBeNull();
});

it("does not age out useful reference data, fresh progress, future tasks or recurring reminders", async () => {
  const a = await account();
  await db.insert(s.tasks).values([{ userId: a.user.id, title: "Future", dueAt: new Date(now.getTime() + DAY_MS), updatedAt: old }, { userId: a.user.id, title: "Just edited", dueAt: old, updatedAt: now }]);
  await db.insert(s.reminders).values({ userId: a.user.id, text: "Daily water", status: "sent", remindAt: old, timezone: "UTC", recurrence: "daily", idempotencyKey: randomUUID(), updatedAt: old });
  await db.insert(s.memoryEntries).values({ userId: a.user.id, category: "fact", content: "My favourite color is blue", updatedAt: old });
  await db.insert(s.lifeItems).values({ id: randomUUID(), userId: a.user.id, data: { kind: "recipe", title: "Rice", ingredients: "rice", instructions: "cook", servings: 1, prepMinutes: 20, favorite: true }, updatedAt: old });
  expect(await a.repo.reserve(a.user.id, now)).toBeNull();
  expect(reviewIsDue(old, null, now)).toBe(true);
  expect(reviewIsDue(now, old, now)).toBe(false);
});

it("rechecks opt-in after reservation and before sending; shadow mode cannot reserve or send", async () => {
  const a = await account(); await staleTask(a.user.id);
  const transport = new TestSmsTransport("REVIEWS");
  const sender = new SafeSmsSender(new DrizzleOutboundMessageRepository(db), transport, () => now);
  const input = { userId: a.user.id, enabled: false, repository: a.repo, sender, now: () => now, runOwned: async <T>(operation: () => Promise<T>) => operation() };
  expect(await deliverItemReview(input)).toBe(false);
  expect(await db.select().from(s.itemReviews).where(eq(s.itemReviews.userId, a.user.id))).toEqual([]);
  await a.repo.reserve(a.user.id, now);
  await db.update(s.users).set({ proactiveOptIn: false }).where(eq(s.users.id, a.user.id));
  await deliverItemReview({ ...input, enabled: true });
  expect(transport.sent).toEqual([]);
});

it("20 fictional accounts get independent reviews; simultaneous evaluations reuse the same reservation", async () => {
  const accounts = await Promise.all(Array.from({ length: 20 }, () => account()));
  await Promise.all(accounts.map(a => staleTask(a.user.id)));
  const reserved = await Promise.all(accounts.map(a => a.repo.reserve(a.user.id, now)));
  expect(new Set(reserved.map(row => row?.id)).size).toBe(20);
  for (let index = 0; index < accounts.length; index++) expect(reserved[index]?.userId).toBe(accounts[index].user.id);
  const duplicate = await Promise.all([accounts[0].repo.reserve(accounts[0].user.id, now), accounts[0].repo.reserve(accounts[0].user.id, now)]);
  expect(duplicate.map(row => row?.id)).toEqual([reserved[0]!.id, reserved[0]!.id]);
});
