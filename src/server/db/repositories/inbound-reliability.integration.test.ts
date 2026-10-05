import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { TempoDatabase } from "../client";
import { scopedDatabase } from "../database-scope";
import * as schema from "../schema";
import { ConversationOrchestrator, type InboundConversationContext } from "../../domain/conversation-orchestrator";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { inOwnedExecution, ownedService } from "../../domain/inbound-execution";
import { TestSmsTransport } from "../../adapters/sms/sms-transport";
import { DrizzleConversationRepository } from "./conversation-repository";
import { DrizzleOutboundMessageRepository } from "./outbound-message-repository";
import { DrizzleTaskRepository } from "./task-repository";
import { DrizzleGoalRepository } from "./goal-repository";
import { DrizzleSchedulingRepository } from "./scheduling-repository";
import { DrizzleConversationHistoryRepository } from "./conversation-history-repository";
import { WebReplySender } from "./web-reply-repository";
import { ensureDirectConversation } from "./messaging-identity-repository";

let client: PGlite;
let database: TempoDatabase;
let phone = 5000;
beforeAll(async () => {
  client = new PGlite();
  for (const name of (await readdir(resolve("drizzle"))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    await client.exec((await readFile(resolve("drizzle", name), "utf8")).replaceAll("--> statement-breakpoint", ""));
  }
  database = scopedDatabase(drizzle(client, { schema }) as unknown as TempoDatabase);
});
afterAll(async () => { await client.close(); });

async function inbound(web = false) {
  const [user] = await database.insert(schema.users).values({ phoneE164: `+1202555${++phone}`, onboardingState: "complete" }).returning();
  await database.insert(schema.consentRecords).values({ userId: user.id, status: "granted", channel: "sms", disclosureVersion: "test", termsVersion: "test", privacyVersion: "test" });
  const identity = await ensureDirectConversation(database, { userId: user.id, phoneE164: user.phoneE164 });
  const [message] = await database.insert(schema.conversationMessages).values({ userId: user.id, conversationId: identity.conversationId, direction: "inbound", kind: "user", status: "received", body: "Please discuss this plan", ...(web ? { idempotencyKey: `web-chat:${user.id}:${randomUUID()}` } : {}) }).returning();
  return { user, message };
}

function coach(messageId: string, web: boolean, transport = new TestSmsTransport(randomUUID())) {
  const parse = vi.fn(async () => ({ kind: "conversation" as const, reply: "Canonical model reply with its original detail." }));
  const conversations = new DrizzleConversationRepository(database);
  const orchestrator = new ConversationOrchestrator(conversations, new DrizzleTaskRepository(database), new DrizzleGoalRepository(database), new DrizzleSchedulingRepository(database), { parse }, web ? new WebReplySender(messageId, database) : new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport));
  return { orchestrator, conversations, parse, transport };
}

it("resumes a committed reservation and records SMS parent linkage exactly once", async () => {
  const { user, message } = await inbound();
  const run = coach(message.id, false);
  const context = (await run.conversations.claimInbound(message.id, new Date()))!;
  await run.conversations.persistReply(context, "Persisted reply before a crash.");
  await new DrizzleOutboundMessageRepository(database).reserve({ userId: user.id, body: "Persisted reply before a crash.", kind: "coach", idempotencyKey: `reply:${message.id}`, sourceMessageId: message.id });
  await run.conversations.releaseInbound(message.id, context.processingToken);
  await run.orchestrator.process(message.id);
  await run.orchestrator.process(message.id);
  expect(run.parse).not.toHaveBeenCalled();
  expect(run.transport.sent).toHaveLength(1);
  const [reply] = await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.idempotencyKey, `reply:${message.id}`));
  expect(reply.outboundState).toBe("accepted");
  expect(await database.select().from(schema.messageRelations).where(eq(schema.messageRelations.sourceMessageId, reply.id))).toEqual([expect.objectContaining({ targetMessageId: message.id, conversationId: message.conversationId })]);
});

it("replays the persisted web reply after a crash without calling the model", async () => {
  const { user, message } = await inbound(true);
  const run = coach(message.id, true);
  const context = (await run.conversations.claimInbound(message.id, new Date()))!;
  await run.conversations.persistReply(context, "Already committed detailed reply.");
  await new WebReplySender(message.id, database).send({ userId: user.id, body: "Already committed detailed reply.", kind: "coach", idempotencyKey: `reply:${message.id}` });
  await run.conversations.releaseInbound(message.id, context.processingToken);
  await run.orchestrator.process(message.id);
  expect(run.parse).not.toHaveBeenCalled();
  expect(await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.idempotencyKey, `reply:${message.id}`))).toHaveLength(1);
  expect((await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.id, message.id)))[0].status).toBe("processed");
});

it("retains the committed action receipt when cancellation interrupts model follow-up", async () => {
  const { user, message } = await inbound();
  const controller = new AbortController();
  const transport = new TestSmsTransport(randomUUID());
  const parse = vi.fn(async (input: Parameters<import("../../adapters/llm/task-intent-parser").TaskIntentParser["parse"]>[0]) => {
    await input.execute!({ type: "create_task", title: "Atomic receipt task" });
    controller.abort();
    throw new Error("Interrupted model follow-up");
  });
  const coach = new ConversationOrchestrator(new DrizzleConversationRepository(database), new DrizzleTaskRepository(database), new DrizzleGoalRepository(database), new DrizzleSchedulingRepository(database), {
    parse, authorizer: { authorize: async () => ({ mode: "write", commands: ["create_task"] }) },
  }, new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport));
  await expect(coach.process(message.id, controller.signal)).rejects.toThrow();
  expect((await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.id, message.id)))[0].replyBody).toBe("Added: Atomic receipt task.");
  await coach.process(message.id);
  expect(parse).toHaveBeenCalledTimes(1);
  expect(transport.sent.map(row => row.body)).toEqual(["Added: Atomic receipt task."]);
  expect(await database.select().from(schema.tasks).where(eq(schema.tasks.userId, user.id))).toHaveLength(1);
});

it("never marks ambiguous provider acceptance complete or automatically sends it again", async () => {
  const { message } = await inbound();
  const transport = new TestSmsTransport();
  vi.spyOn(transport, "send").mockRejectedValue(new Error("Connection lost after possible provider acceptance"));
  const run = coach(message.id, false, transport);
  await expect(run.orchestrator.process(message.id)).rejects.toThrow("Connection lost");
  await expect(run.orchestrator.process(message.id)).rejects.toThrow("reconciliation");
  expect(transport.send).toHaveBeenCalledTimes(1);
  expect((await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.id, message.id)))[0].status).toBe("received");
  expect((await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.idempotencyKey, `reply:${message.id}`)))[0].outboundState).toBe("ambiguous");
});

it("retries an explicitly rejected submission using the canonical reply", async () => {
  const { message } = await inbound();
  const transport = new TestSmsTransport(randomUUID());
  const send = vi.spyOn(transport, "send");
  send.mockRejectedValueOnce(Object.assign(new Error("Provider rejected the request before acceptance"), { submissionOutcome: "not_accepted" }));
  const run = coach(message.id, false, transport);
  await expect(run.orchestrator.process(message.id)).rejects.toThrow("rejected");
  expect((await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.idempotencyKey, `reply:${message.id}`)))[0].outboundState).toBe("reserved");
  await run.orchestrator.process(message.id);
  expect(run.parse).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledTimes(2);
  expect(transport.sent).toHaveLength(1);
  expect((await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.id, message.id)))[0].status).toBe("processed");
});

it("rejects stale writes, release and completion after another attempt claims ownership", async () => {
  const { user, message } = await inbound();
  const repository = new DrizzleConversationRepository(database);
  const first = (await repository.claimInbound(message.id, new Date("2026-01-01T00:00:00Z")))!;
  const second = (await repository.claimInbound(message.id, new Date("2026-01-01T00:06:00Z")))!;
  await expect(inOwnedExecution({ run: operation => repository.withOwnership(first, operation) }, () => ownedService(new DrizzleTaskRepository(database)).create({ userId: user.id, sourceMessageId: message.id, title: "Stale attempt" }))).rejects.toThrow("ownership");
  await repository.releaseInbound(message.id, first.processingToken);
  await expect(repository.markProcessed(user.id, message.id, first.processingToken)).rejects.toThrow("ownership");
  const [current] = await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.id, message.id));
  expect(current).toMatchObject({ status: "processing", processingToken: second.processingToken });
  expect(await database.select().from(schema.tasks).where(eq(schema.tasks.userId, user.id))).toHaveLength(0);
});

it("rolls a database mutation back if cancellation arrives before its owned transaction commits", async () => {
  const { user, message } = await inbound();
  const repository = new DrizzleConversationRepository(database);
  const context: InboundConversationContext = (await repository.claimInbound(message.id, new Date()))!;
  const controller = new AbortController();
  context.signal = controller.signal;
  await expect(repository.withOwnership(context, async () => {
    await new DrizzleTaskRepository(database).create({ userId: user.id, sourceMessageId: message.id, title: "Rolled back" });
    controller.abort();
  })).rejects.toThrow();
  expect(await database.select().from(schema.tasks).where(eq(schema.tasks.userId, user.id))).toHaveLength(0);
});

it("includes a preceding turn's late reply but excludes later human input", async () => {
  const { user, message } = await inbound(true);
  const start = new Date("2026-01-01T00:00:00Z");
  await database.update(schema.conversationMessages).set({ status: "processed", createdAt: start }).where(eq(schema.conversationMessages.id, message.id));
  const [answer] = await database.insert(schema.conversationMessages).values({ userId: user.id, conversationId: message.conversationId, direction: "inbound", kind: "user", status: "received", body: "9 AM works", createdAt: new Date(start.getTime() + 1000) }).returning();
  await new WebReplySender(message.id, database).send({ userId: user.id, body: "What time works?", kind: "coach", idempotencyKey: `reply:${message.id}` });
  await database.insert(schema.conversationMessages).values({ userId: user.id, conversationId: message.conversationId, direction: "inbound", kind: "user", status: "processed", body: "A later unrelated request", createdAt: new Date(start.getTime() + 2000) });
  const history = await new DrizzleConversationHistoryRepository(database).getRecent({ conversationId: message.conversationId, beforeMessageId: answer.id, limit: 12 });
  expect(history.map(row => row.content)).toEqual([message.body, "What time works?"]);
  expect(history[1].replyToMessageId).toBe(message.id);
  expect(await database.select().from(schema.conversationMessages).where(and(eq(schema.conversationMessages.userId, user.id), eq(schema.conversationMessages.direction, "outbound")))).toHaveLength(1);
});
