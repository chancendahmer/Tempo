import { DrizzleItemReviewRepository } from "../../src/server/db/repositories/item-review-repository";
import { scopedDatabase } from "../../src/server/db/database-scope";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import type { TaskIntentParser, CoachingCommand } from "../../src/server/adapters/llm/task-intent-parser";
import { WRITE_COMMANDS } from "../../src/server/domain/turn-write-policy";
import { TestSmsTransport } from "../../src/server/adapters/sms/sms-transport";
import { parseSendblueWebhook } from "../../src/server/adapters/sms/sendblue-webhook";
import { ConversationOrchestrator } from "../../src/server/domain/conversation-orchestrator";
import { SafeSmsSender } from "../../src/server/domain/outbound-messaging";
import { MemoryService } from "../../src/server/domain/memory-service";
import type { AssistantIntegrations, CalendarChange } from "../../src/server/domain/assistant-commands";
import type { TempoDatabase } from "../../src/server/db/client";
import * as schema from "../../src/server/db/schema";
import { DrizzleConversationRepository } from "../../src/server/db/repositories/conversation-repository";
import { DrizzleConversationHistoryRepository } from "../../src/server/db/repositories/conversation-history-repository";
import { DrizzleMessagingRepository } from "../../src/server/db/repositories/messaging-repository";
import { DrizzleTaskRepository } from "../../src/server/db/repositories/task-repository";
import { DrizzleGoalRepository } from "../../src/server/db/repositories/goal-repository";
import { DrizzleSchedulingRepository } from "../../src/server/db/repositories/scheduling-repository";
import { DrizzleOutboundMessageRepository } from "../../src/server/db/repositories/outbound-message-repository";
import { DrizzleMemoryRepository } from "../../src/server/db/repositories/memory-repository";
import { DrizzleReminderRepository } from "../../src/server/db/repositories/reminder-repository";
import { ensureDirectConversation } from "../../src/server/db/repositories/messaging-identity-repository";
import { LifeAssistant } from "../../src/server/db/repositories/life-assistant";
import { mutateWorkspace, readWorkspace } from "../../src/server/db/repositories/workspace-repository";
import { WebReplySender } from "../../src/server/db/repositories/web-reply-repository";
import { createSimulatedCalendar } from "./simulated-calendar";

export type TranscriptTurn = {
  input: string; replies: string[]; providerId: string; duplicate: boolean;
  decisionAt: string; parserCalled: boolean; tools: string[]; elapsedMs: number;
  // Synthetic-account evidence only: retain arguments/results so a failed
  // lookup can be distinguished from a clock, query, or persistence defect.
  toolTrace?: { command: CoachingCommand; result: string }[];
  channel?: "sms" | "web";
};

/** Test-only database and transport. No production connection or provider sender is constructed. */
export async function createAssistantSimulator(parser: TaskIntentParser) {
  const client = new PGlite();
  try {
    for (const file of (await readdir(resolve("drizzle"))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      await client.exec((await readFile(resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", ""));
    }
  } catch (error) { await client.close(); throw error; }
  const database = scopedDatabase(drizzle(client, { schema }) as unknown as TempoDatabase);
  const transport = new TestSmsTransport("SIMULATED");
  const calendarWrites: Array<{ userId: string; change: CalendarChange }> = [];
  const calendar = createSimulatedCalendar();
  const pendingCalendar = new Map<string, { userId: string; change: CalendarChange; expiresAt: number }>();
  let userNumber = 100;
  let clock = new Date();
  const integrations: AssistantIntegrations = {
    status: async () => "Calendar: simulated fixture only. Email, Apple Calendar, shopping and health data: not connected.",
    agenda: async (userId, start, end) => calendar.agenda(userId, start, end),
    proposeCalendarChange: async (userId, _messageId, change, _timezone, now) => {
      const token = randomUUID();
      pendingCalendar.set(token, { userId, change, expiresAt: now.getTime() + 900_000 });
      return { token, summary: `Proposed calendar ${change.operation}: ${JSON.stringify(change)}. Reply YES to confirm or NO to cancel.` };
    },
    confirmCalendarChange: async (userId, token, now) => {
      const pending = pendingCalendar.get(token);
      if (!pending || pending.userId !== userId || pending.expiresAt <= now.getTime()) throw new Error("Invalid test proposal");
      calendar.apply(userId, pending.change);
      calendarWrites.push({ userId, change: pending.change });
      pendingCalendar.delete(token);
      return "Confirmed calendar change in the simulated calendar.";
    },
    setCheckins: async (userId, enabled, dailyCap) => {
      await database.update(schema.users).set({ proactiveOptIn: enabled, dailyInterventionCap: enabled ? Math.min(3, dailyCap) : 0 }).where(eq(schema.users.id, userId));
      return enabled ? "Check-in preference saved. Proactive delivery is disabled in this simulation." : "Optional check-ins are off.";
    },
  };
  return {
    database, transport, calendarWrites,
    close: () => client.close(),
    setTime: (time: Date) => { clock = time; },
    async user() {
      const phone = `+12025550${userNumber++}`;
      const [user] = await database.insert(schema.users).values({ phoneE164: phone, timezone: "America/New_York", onboardingState: "complete" }).returning();
      await database.insert(schema.consentRecords).values({ userId: user.id, status: "granted", channel: "sms", disclosureVersion: "simulation", termsVersion: "simulation", privacyVersion: "simulation" });
      await ensureDirectConversation(database, { userId: user.id, phoneE164: phone });
      const transcript: TranscriptTurn[] = [];
      return {
        id: user.id, transcript,
        workspace: () => readWorkspace(user.id, database),
        async send(body: string, options: { providerId?: string; mediaUrl?: unknown; channel?: "sms" | "web" } = {}) {
          const start = performance.now();
          const providerId = options.providerId ?? randomUUID();
          const channel = options.channel ?? "sms";
          const parsed = parseSendblueWebhook({ content: body, is_outbound: false, status: "RECEIVED", message_handle: providerId, from_number: phone, to_number: "+12025550100", media_url: options.mediaUrl });
          if (parsed.kind !== "inbound") throw new Error("Expected text input");
          const webKey = `web-chat:${user.id}:${providerId}`;
          const [prior] = channel === "web" ? await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.idempotencyKey, webKey)).limit(1) : [];
          const receipt = channel === "web"
            ? (await mutateWorkspace(user.id, { action: "chat", requestId: providerId, text: body }, database), { duplicate: Boolean(prior) })
            : await new DrizzleMessagingRepository(database).ingestInbound(parsed.input);
          const [message] = await database.select().from(schema.conversationMessages).where(and(eq(schema.conversationMessages.userId, user.id), channel === "web" ? eq(schema.conversationMessages.idempotencyKey, webKey) : eq(schema.conversationMessages.providerMessageSid, providerId))).limit(1);
          // Keep persisted history on the same injected clock as model decisions.
          // Otherwise a future-date fixture inherits the real machine's date.
          if (!receipt.duplicate) {
            clock = new Date(clock.getTime() + 1);
            await database.update(schema.conversationMessages).set({createdAt:clock,receivedAt:clock}).where(eq(schema.conversationMessages.id,message.id));
          }
          const [job] = await database.select().from(schema.scheduledActions).where(and(
            eq(schema.scheduledActions.userId, user.id),
            eq(schema.scheduledActions.idempotencyKey, channel === "web" ? `web-process:${message.id}` : `inbound:sendblue:${providerId}`),
            eq(schema.scheduledActions.status, "scheduled"),
          )).limit(1);
          const turn: TranscriptTurn = { decisionAt: clock.toISOString(), input: body, replies: [], providerId, duplicate: receipt.duplicate, parserCalled: false, tools: [], elapsedMs: 0, channel };
          const beforeWeb = channel === "web" ? (await readWorkspace(user.id, database)).messages.map(row => row.id) : [];
          const before = transport.sent.length;
          const observedParser: TaskIntentParser = {
            // Live parsers retain their real authorization adapter. Scripted
            // fixtures isolate code paths and do not evaluate semantic permission.
            authorizer: parser.authorizer ?? { authorize: async () => ({ mode: "write", commands: [...WRITE_COMMANDS] }) },
            parse: async (input) => {
            turn.parserCalled = true;
            const result = await parser.parse({ ...input, execute: async (command: CoachingCommand) => {
              turn.tools.push(command.type);
              const result = await input.execute!(command);
              (turn.toolTrace ??= []).push({ command, result });
              return result;
            } });
            if (result.kind === "command") turn.tools.push(result.command.type);
            return result;
          } };
          const orchestrator = new ConversationOrchestrator(
            new DrizzleConversationRepository(database), new DrizzleTaskRepository(database),
            new DrizzleGoalRepository(database), new DrizzleSchedulingRepository(database), observedParser,
            channel === "web" ? new WebReplySender(message.id, database) : new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport), () => clock,
            undefined, new MemoryService(new DrizzleMemoryRepository(database)), undefined,
            new DrizzleConversationHistoryRepository(database), new DrizzleReminderRepository(database), integrations, new LifeAssistant(database), new DrizzleItemReviewRepository(database),
          );
          if (!receipt.duplicate && job && message.status === "received") {
            await orchestrator.process(message.id);
            clock = new Date(clock.getTime() + 1);
            await database.update(schema.conversationMessages).set({createdAt:clock}).where(eq(schema.conversationMessages.idempotencyKey,`reply:${message.id}`));
            await database.update(schema.scheduledActions).set({ status: "completed", completedAt: new Date() }).where(eq(schema.scheduledActions.id, job.id));
          }
          turn.replies = channel === "web"
            ? (await readWorkspace(user.id, database)).messages.filter(row => row.direction === "outbound" && !beforeWeb.includes(row.id)).map(row => row.body)
            : transport.sent.slice(before).filter((item) => item.to === phone).map((item) => item.body);
          turn.elapsedMs = Math.round(performance.now() - start);
          transcript.push(turn);
          return turn;
        },
        async state() {
          const [tasks, reminders, memories, userRows, lifeItems] = await Promise.all([
            database.select().from(schema.tasks).where(eq(schema.tasks.userId, user.id)),
            database.select().from(schema.reminders).where(eq(schema.reminders.userId, user.id)),
            new DrizzleMemoryRepository(database).retrieveRelevant(user.id, clock, 100),
            database.select().from(schema.users).where(eq(schema.users.id, user.id)),
            database.select().from(schema.lifeItems).where(eq(schema.lifeItems.userId, user.id)),
          ]);
          return { tasks, reminders, memories, lifeItems, user: userRows[0], calendarWrites: calendarWrites.filter((item) => item.userId === user.id) };
        },
      };
    },
  };
}

export type AssistantSimulator = Awaited<ReturnType<typeof createAssistantSimulator>>;
