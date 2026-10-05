import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import { expect, it } from "vitest";
import * as schema from "../db/schema";
import { scopedDatabase } from "../db/database-scope";
import { DrizzleConversationRepository } from "../db/repositories/conversation-repository";
import { DrizzleConversationHistoryRepository } from "../db/repositories/conversation-history-repository";
import { DrizzleMessagingRepository } from "../db/repositories/messaging-repository";
import { DrizzleOutboundMessageRepository } from "../db/repositories/outbound-message-repository";
import { DrizzleTaskRepository } from "../db/repositories/task-repository";
import { DrizzleGoalRepository } from "../db/repositories/goal-repository";
import { DrizzleSchedulingRepository } from "../db/repositories/scheduling-repository";
import { mutateWorkspace } from "../db/repositories/workspace-repository";
import { isWebMessage, WebReplySender } from "../db/repositories/web-reply-repository";
import { ConversationOrchestrator, type InboundConversationContext } from "../domain/conversation-orchestrator";
import { SafeSmsSender } from "../domain/outbound-messaging";
import { TestSmsTransport } from "../adapters/sms/sms-transport";
import { dispatchDueActions } from "./dispatcher";
import { JOB_NAMES, type ProcessInboundJob } from "./names";
import { ScheduledActionRepository } from "./scheduled-action-repository";

const url = process.env.TEST_DATABASE_URL;
it.skipIf(!url)("real PostgreSQL: two dispatchers preserve twenty accounts' duplicate SMS and back-to-back web chronology", async () => {
  const parsed = new URL(url!);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || !/^\/tempo_/.test(parsed.pathname)) throw new Error("Requires disposable local tempo_* database");
  const admin = new Pool({ connectionString: url, max: 1 });
  const databaseName = `tempo_concurrency_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const isolatedUrl = new URL(url!);
  isolatedUrl.pathname = `/${databaseName}`;
  const pool = new Pool({ connectionString: isolatedUrl.toString(), max: 12 });
  const database = scopedDatabase(drizzle(pool, { schema }));
  const boss = new PgBoss({ connectionString: isolatedUrl.toString(), schema: "pgboss_concurrency" });
  const errors: unknown[] = [];
  boss.on("error", error => errors.push(error));
  const people: Array<{ id: string; marker: string }> = [];
  const completed: string[] = [];
  const transport = new TestSmsTransport(randomUUID());
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    await migrate(database, { migrationsFolder: "drizzle" });
    await boss.start();
    await boss.createQueue(JOB_NAMES.processInbound, { policy: "key_strict_fifo", retryLimit: 1, retryDelay: 1, expireInSeconds: 60 });
    await boss.work<ProcessInboundJob>(JOB_NAMES.processInbound, { localConcurrency: 4, pollingIntervalSeconds: 0.5 }, async jobs => {
      for (const job of jobs) {
        try {
          const person = people.find(person => person.id === job.data.userId)!;
          const web = await isWebMessage(job.data.messageId, database);
          const coach = new ConversationOrchestrator(new DrizzleConversationRepository(database), new DrizzleTaskRepository(database), new DrizzleGoalRepository(database), new DrizzleSchedulingRepository(database), {
            authorizer: { authorize: async () => ({ mode: "write", commands: ["create_task"] }) },
            parse: async input => {
              expect(input.openTasks.map(task => task.title)).toEqual([person.marker]);
              expect(input.history?.some(row => row.role === "assistant" && row.content.includes(person.marker) && row.replyToMessageId)).toBe(true);
              for (const other of people.filter(other => other.id !== person.id)) expect(JSON.stringify(input)).not.toContain(other.marker);
              return { kind: "conversation", reply: `[SCRIPTED] ${person.marker}` };
            },
          }, web ? new WebReplySender(job.data.messageId, database) : new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport), undefined, undefined, undefined, undefined, new DrizzleConversationHistoryRepository(database));
          await coach.process(job.data.messageId, job.signal);
          await new ScheduledActionRepository(database).markCompleted(job.data.scheduledActionId);
          completed.push(job.data.messageId);
        } catch (error) { errors.push(error); throw error; }
      }
    });
    const run = randomUUID().slice(0, 8);
    for (let index = 0; index < 20; index++) {
      const [user] = await database.insert(schema.users).values({ phoneE164: `+1303${Date.now().toString().slice(-5)}${String(index).padStart(2, "0")}`, onboardingState: "complete", lastInboundAt: new Date(), phoneVerifiedAt: new Date() }).returning();
      await database.insert(schema.consentRecords).values({ userId: user.id, status: "granted", channel: "sms", disclosureVersion: "test", termsVersion: "test", privacyVersion: "test" });
      people.push({ id: user.id, marker: `PRIVATE_${run}_${index}_ONLY` });
    }
    await Promise.all(people.map(async person => {
      const [user] = await database.select().from(schema.users).where(eq(schema.users.id, person.id));
      const input = { provider: "test" as const, providerMessageId: randomUUID(), from: user.phoneE164, to: "+12025550100", body: `Add task ${person.marker}` };
      const repository = new DrizzleMessagingRepository(database);
      const receipts = await Promise.all([repository.ingestInbound(input), repository.ingestInbound(input)]);
      expect(receipts.filter(receipt => receipt.duplicate)).toHaveLength(1);
      await mutateWorkspace(person.id, { action: "chat", requestId: randomUUID(), text: "Please inspect my current plan" }, database);
    }));
    const deadline = Date.now() + 45000;
    while (completed.length < 40 && Date.now() < deadline && !errors.length) {
      await Promise.all([dispatchDueActions(boss, 5, database), dispatchDueActions(boss, 5, database)]);
      await delay(100);
    }
    expect(errors).toEqual([]);
    expect(new Set(completed).size).toBe(40);
    expect(transport.sent).toHaveLength(20);
    const tasks = await database.select().from(schema.tasks).where(inArray(schema.tasks.userId, people.map(person => person.id)));
    expect(tasks).toHaveLength(20);
    for (const person of people) {
      expect(tasks.filter(task => task.userId === person.id).map(task => task.title)).toEqual([person.marker]);
      const messages = await database.select().from(schema.conversationMessages).where(and(eq(schema.conversationMessages.userId, person.id), eq(schema.conversationMessages.direction, "outbound")));
      expect(messages).toHaveLength(2);
      expect(messages.every(message => message.body.includes(person.marker))).toBe(true);
    }
    // Separate real connections prove that takeover waits for the guarded write,
    // and cancellation rolls the entire write back before the new claim wins.
    const [conversation] = await database.select().from(schema.conversations).where(eq(schema.conversations.ownerUserId, people[0].id));
    const [message] = await database.insert(schema.conversationMessages).values({ userId: people[0].id, conversationId: conversation.id, direction: "inbound", kind: "user", status: "received", body: "Transactional ownership probe" }).returning();
    const repository = new DrizzleConversationRepository(database);
    const first: InboundConversationContext = (await repository.claimInbound(message.id, new Date(Date.now() - 360000)))!;
    const controller = new AbortController();
    first.signal = controller.signal;
    let entered!: () => void;
    let unblock!: () => void;
    const writing = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { unblock = resolve; });
    const mutation = repository.withOwnership(first, async () => {
      await new DrizzleTaskRepository(database).create({ userId: people[0].id, sourceMessageId: message.id, title: "Must roll back" });
      entered();
      await hold;
    });
    const rejected = expect(mutation).rejects.toThrow();
    await writing;
    let claimed = false;
    const takeover = repository.claimInbound(message.id, new Date()).then(context => { claimed = true; return context!; });
    await delay(100);
    const takeoverWaited = !claimed;
    controller.abort();
    unblock();
    await rejected;
    const second = await takeover;
    expect(takeoverWaited).toBe(true);
    expect(second.processingToken).not.toBe(first.processingToken);
    await repository.releaseInbound(message.id, first.processingToken);
    await expect(repository.markProcessed(people[0].id, message.id, first.processingToken)).rejects.toThrow("ownership");
    expect(await database.select().from(schema.tasks).where(eq(schema.tasks.sourceMessageId, message.id))).toHaveLength(0);
    expect((await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.id, message.id)))[0].processingToken).toBe(second.processingToken);

    for (const kind of ["sync_calendar", "evaluate_context"] as const) {
      const [action] = await database.insert(schema.scheduledActions).values({userId:people[0].id,kind,payload:{},runAt:new Date(),idempotencyKey:randomUUID()}).returning();
      const firstAction = new ScheduledActionRepository(database), nextAction = new ScheduledActionRepository(database);
      const oldOwner = await firstAction.claimRecurring(action.id,new AbortController().signal,10000);
      await expect(nextAction.claimRecurring(action.id,new AbortController().signal,10000)).rejects.toThrow("still owned");
      await database.update(schema.scheduledActions).set({attemptExpiresAt:new Date(Date.now()-1000)}).where(eq(schema.scheduledActions.id,action.id));
      await nextAction.claimRecurring(action.id,new AbortController().signal,10000);
      await expect(oldOwner!.run(async()=>undefined)).rejects.toThrow("ownership lost");
      const finish = kind === "sync_calendar" ? nextAction.completeAndScheduleCalendarSync.bind(nextAction) : nextAction.completeAndScheduleContextEvaluation.bind(nextAction);
      await Promise.all([finish(action.id,people[0].id,new Date()),finish(action.id,people[0].id,new Date())]);
      await firstAction.markFailed(action.id,"late failure");
      await firstAction.scheduleRecurringRecovery({failedActionId:action.id,userId:people[0].id,kind,runAt:new Date()});
      const rows=await database.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.userId,people[0].id));
      expect(rows.filter(r=>r.idempotencyKey.endsWith("after:"+action.id))).toHaveLength(1);
      expect(rows.some(r=>r.idempotencyKey==="recovery:"+action.id)).toBe(false);
      expect(rows.find(r=>r.id===action.id)?.status).toBe("completed");
    }
  } finally {
    await boss.stop({ graceful: true, timeout: 1000 });
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  }
}, 90000);
