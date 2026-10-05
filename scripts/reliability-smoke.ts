/** Isolated real-PostgreSQL/pg-boss restart drill. Never uses DATABASE_URL. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import * as schema from "../src/server/db/schema";
import { scopedDatabase } from "../src/server/db/database-scope";
import { DrizzleConversationRepository } from "../src/server/db/repositories/conversation-repository";
import { DrizzleOutboundMessageRepository } from "../src/server/db/repositories/outbound-message-repository";
import { DrizzleTaskRepository } from "../src/server/db/repositories/task-repository";
import { DrizzleGoalRepository } from "../src/server/db/repositories/goal-repository";
import { DrizzleSchedulingRepository } from "../src/server/db/repositories/scheduling-repository";
import { ensureDirectConversation } from "../src/server/db/repositories/messaging-identity-repository";
import { ConversationOrchestrator, type InboundConversationContext } from "../src/server/domain/conversation-orchestrator";
import { SafeSmsSender } from "../src/server/domain/outbound-messaging";
import { TEXT_ONLY_CAPABILITIES, type SendMessageInput } from "../src/server/adapters/sms/sms-transport";
import { ScheduledActionRepository } from "../src/server/jobs/scheduled-action-repository";

type Stage = "domain_write" | "reservation" | "provider_acceptance" | "reply_persisted";
type Payload = { messageId: string; actionId: string };
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("Set TEST_DATABASE_URL to a disposable local tempo_* database.");
const location = new URL(connectionString);
if (!["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) || !/^\/tempo_[a-z0-9_]+$/i.test(location.pathname)) {
  throw new Error("The restart drill only accepts a disposable local tempo_* database.");
}
const pool = new Pool({ connectionString, max: 10 });
const providerPool = new Pool({ connectionString, max: 2 });
const database = scopedDatabase(drizzle(pool, { schema }));
const boss = new PgBoss({ connectionString, schema: "pgboss_reliability", superviseIntervalSeconds: 1, maintenanceIntervalSeconds: 1 });
boss.on("error", error => process.stderr.write(`Queue error: ${error.message}\n`));

async function barrier(stage: Stage, selected: string) {
  if (stage !== selected) return;
  process.send?.({ checkpoint: stage });
  // The parent terminates this known child at a durable boundary.
  await new Promise<void>(() => { setInterval(() => undefined, 1000); });
}

async function worker(queue: string, fault: string) {
  await boss.start();
  await boss.work<Payload>(queue, { pollingIntervalSeconds: 0.5 }, async jobs => {
    for (const job of jobs) {
      const conversations = new class extends DrizzleConversationRepository {
        private replyWrites = 0;
        async persistReply(context: InboundConversationContext, body: string) {
          // The first write commits the action result with its mutation; the
          // second is the completed model reply immediately before delivery.
          if (++this.replyWrites === 2) await barrier("domain_write", fault);
          return super.persistReply(context, body);
        }
        async markProcessed(userId: string, messageId: string, token: string) {
          await barrier("reply_persisted", fault);
          return super.markProcessed(userId, messageId, token);
        }
      }(database);
      const outbound = new class extends DrizzleOutboundMessageRepository {
        async beginSubmission(id: string) {
          await barrier("reservation", fault);
          return super.beginSubmission(id);
        }
      }(database);
      const sender = new SafeSmsSender(outbound, {
        getCapabilities: () => TEXT_ONLY_CAPABILITIES,
        send: async (input: SendMessageInput) => {
          const handle = randomUUID();
          await providerPool.query("insert into reliability_provider_acceptances (id, operation_key) values ($1, $2)", [handle, input.idempotencyKey]);
          await barrier("provider_acceptance", fault);
          return { provider: "test" as const, providerMessageSid: handle, status: "queued" };
        },
      });
      const coach = new ConversationOrchestrator(conversations, new DrizzleTaskRepository(database), new DrizzleGoalRepository(database), new DrizzleSchedulingRepository(database), {
        authorizer: { authorize: async () => ({ mode: "write", commands: ["create_task"] }) },
        parse: async () => ({ kind: "conversation", reply: "[SCRIPTED] Restart drill." }),
      }, sender);
      const actions = new ScheduledActionRepository(database);
      try {
        await actions.markRunning(job.data.actionId);
        await coach.process(job.data.messageId, job.signal);
        await actions.markCompleted(job.data.actionId);
      } catch (error) {
        if (!job.signal.aborted) await actions.markFailed(job.data.actionId, error);
        throw error;
      }
    }
  });
  process.send?.({ ready: true });
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
  child.kill("SIGKILL");
  await exited;
}
function start(queue: string, stage: string) {
  return spawn(process.execPath, ["--import", "tsx", resolve("scripts/reliability-smoke.ts"), "--worker", queue, stage], {
    cwd: process.cwd(), env: { ...process.env, TEST_DATABASE_URL: connectionString }, stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
  });
}
async function waitFor(condition: () => Promise<boolean>, milliseconds = 30000) {
  const deadline = Date.now() + milliseconds;
  while (!await condition()) {
    if (Date.now() >= deadline) throw new Error("Restart drill condition timed out");
    await delay(250);
  }
}

async function main() {
  await migrate(database, { migrationsFolder: "drizzle" });
  await pool.query("create table if not exists reliability_provider_acceptances (id uuid primary key, operation_key text not null)");
  await boss.start();
  const children: ChildProcess[] = [];
  const run = randomUUID().slice(0, 8);
  const fixtures: Array<{ stage: Stage; queue: string; messageId: string; userId: string; actionId: string }> = [];
  try {
    for (const [index, stage] of (["domain_write", "reservation", "provider_acceptance", "reply_persisted"] as Stage[]).entries()) {
      const queue = `restart-${run}-${stage}`;
      await boss.createQueue(queue, { policy: "key_strict_fifo", retryLimit: 2, retryDelay: 1, retryBackoff: false, expireInSeconds: 3 });
      const phoneE164 = `+1202${Date.now().toString().slice(-6)}${index}`;
      const [user] = await database.insert(schema.users).values({ phoneE164, onboardingState: "complete" }).returning();
      await database.insert(schema.consentRecords).values({ userId: user.id, status: "granted", channel: "sms", disclosureVersion: "synthetic", termsVersion: "synthetic", privacyVersion: "synthetic" });
      const identity = await ensureDirectConversation(database, { userId: user.id, phoneE164 });
      const [message] = await database.insert(schema.conversationMessages).values({ userId: user.id, conversationId: identity.conversationId, direction: "inbound", kind: "user", status: "received", body: `Add task restart ${stage} ${run}` }).returning();
      const [action] = await database.insert(schema.scheduledActions).values({ userId: user.id, kind: "process_inbound_message", status: "running", idempotencyKey: `restart:${message.id}`, payload: { messageId: message.id }, runAt: new Date() }).returning();
      const child = start(queue, stage);
      children.push(child);
      const checkpoint = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No ${stage} checkpoint`)), 30000);
        child.on("message", (value: { checkpoint?: string }) => { if (value.checkpoint === stage) { clearTimeout(timer); resolve(); } });
        child.once("exit", code => { if (code !== null) { clearTimeout(timer); reject(new Error(`Worker exited before ${stage}: ${code}`)); } });
        child.stderr?.on("data", chunk => process.stderr.write(String(chunk)));
      });
      await boss.send(queue, { messageId: message.id, actionId: action.id }, { id: action.id, singletonKey: user.id });
      await checkpoint;
      await stop(child);
      fixtures.push({ stage, queue, messageId: message.id, userId: user.id, actionId: action.id });
      process.stdout.write(`Terminated worker after durable ${stage}.\n`);
    }
    // Use the actual five-minute claim lease. No timestamp edits or simulated clock.
    for (let remaining = 310; remaining > 0; remaining -= 30) {
      process.stdout.write(`Waiting for persisted claims to expire: ${remaining}s.\n`);
      await delay(Math.min(remaining, 30) * 1000);
    }
    for (const fixture of fixtures) {
      const child = start(fixture.queue, "none");
      children.push(child);
      child.stderr?.on("data", chunk => process.stderr.write(String(chunk)));
      await waitFor(async () => {
        const job = await boss.getJobById(fixture.queue, fixture.actionId);
        return job?.state === (fixture.stage === "provider_acceptance" ? "failed" : "completed");
      });
      const [inbound] = await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.id, fixture.messageId));
      const replies = await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.idempotencyKey, `reply:${fixture.messageId}`));
      const tasks = await database.select().from(schema.tasks).where(eq(schema.tasks.userId, fixture.userId));
      const events = await database.select().from(schema.taskEvents).where(eq(schema.taskEvents.sourceMessageId, fixture.messageId));
      const accepted = await providerPool.query<{ count: number }>("select count(*)::int as count from reliability_provider_acceptances where operation_key = $1", [`reply:${fixture.messageId}`]);
      assert.equal(tasks.length, 1);
      assert.equal(events.length, 1);
      assert.equal(replies.length, 1);
      assert.equal(accepted.rows[0].count, 1);
      assert.equal(inbound.status, fixture.stage === "provider_acceptance" ? "received" : "processed");
      assert.equal(replies[0].outboundState, fixture.stage === "provider_acceptance" ? "submitting" : "accepted");
      if (fixture.stage === "provider_acceptance") {
        assert.deepEqual(await boss.getBlockedKeys(fixture.queue), [fixture.userId]);
        const subsequent = await boss.send(fixture.queue, { messageId: fixture.messageId, actionId: randomUUID() }, { singletonKey: fixture.userId });
        await delay(1500);
        assert.equal((await boss.getJobById(fixture.queue, subsequent!))?.state, "created");
      }
      const [action] = await database.select().from(schema.scheduledActions).where(and(eq(schema.scheduledActions.id, fixture.actionId), eq(schema.scheduledActions.userId, fixture.userId)));
      assert.equal(action.status, fixture.stage === "provider_acceptance" ? "failed" : "completed");
      process.stdout.write(`PASS ${fixture.stage}: one task/event/reply/provider acceptance; ${inbound.status}.\n`);
      await stop(child);
    }
    process.stdout.write("PASS real PostgreSQL/pg-boss restart drill. Scripted decisions and captured provider; no carrier/model calls.\n");
  } finally {
    await Promise.all(children.map(stop));
  }
}

(process.argv[2] === "--worker" ? worker(process.argv[3], process.argv[4]) : main().finally(async () => {
  await boss.stop({ graceful: true, timeout: 1000 });
  await pool.end();
  await providerPool.end();
})).catch(error => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1; });
