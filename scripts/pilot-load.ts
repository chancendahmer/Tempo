/** Bounded scripted local drill. No environment loading, worker runtime or real adapters. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import * as schema from "../src/server/db/schema";
import { scopedDatabase } from "../src/server/db/database-scope";
import { DrizzleConversationRepository } from "../src/server/db/repositories/conversation-repository";
import { DrizzleConversationHistoryRepository } from "../src/server/db/repositories/conversation-history-repository";
import { DrizzleMessagingRepository } from "../src/server/db/repositories/messaging-repository";
import { DrizzleOutboundMessageRepository } from "../src/server/db/repositories/outbound-message-repository";
import { DrizzleTaskRepository } from "../src/server/db/repositories/task-repository";
import { DrizzleGoalRepository } from "../src/server/db/repositories/goal-repository";
import { DrizzleSchedulingRepository } from "../src/server/db/repositories/scheduling-repository";
import { mutateWorkspace } from "../src/server/db/repositories/workspace-repository";
import { isWebMessage, WebReplySender } from "../src/server/db/repositories/web-reply-repository";
import { ConversationOrchestrator } from "../src/server/domain/conversation-orchestrator";
import { SafeSmsSender } from "../src/server/domain/outbound-messaging";
import { TEXT_ONLY_CAPABILITIES, type MessagingTransport } from "../src/server/adapters/sms/sms-transport";
import { dispatchDueActions } from "../src/server/jobs/dispatcher";
import { JOB_NAMES, type ProcessInboundJob } from "../src/server/jobs/names";
import { ScheduledActionRepository } from "../src/server/jobs/scheduled-action-repository";
import { assertPilotOwnedDatabase, latencySummary, pilotLoadConfig, PILOT_RUNTIME_MS, PILOT_SYNTHETIC_ADMISSION, PILOT_TURNS_PER_ACCOUNT } from "./pilot-load-config";

let phase = "configuration";
async function main() {
  const config = pilotLoadConfig(process.argv.slice(2));
  const runId = randomUUID().replaceAll("-", "").slice(0, 16);
  const databaseName = `tempo_pilot_${runId}_test`;
  assertPilotOwnedDatabase(databaseName, runId);
  const isolatedUrl = new URL(config.adminUrl); isolatedUrl.pathname = `/${databaseName}`;
  const admin = new Pool({ connectionString: config.adminUrl, max: 1, connectionTimeoutMillis: 3_000, query_timeout: 5_000 });
  const pool = new Pool({ connectionString: isolatedUrl.toString(), max: 10, connectionTimeoutMillis: 3_000, query_timeout: 5_000, statement_timeout: 5_000 });
  const database = scopedDatabase(drizzle(pool, { schema }));
  const boss = new PgBoss({ connectionString: isolatedUrl.toString(), schema: "pgboss", max: 4, connectionTimeoutMillis: 3_000 });
  const errors: string[] = [];
  boss.on("error", () => errors.push("pgboss_error"));
  const abort = new AbortController();
  const started = performance.now();
  // Stop work with fifteen seconds left for cleanup. The independent watchdog
  // bounds even an unresponsive driver/migration/cleanup promise in this process.
  const deadline = setTimeout(() => abort.abort(new Error("Pilot drill reached its work deadline")), PILOT_RUNTIME_MS - 15_000);
  const hardDeadline = setTimeout(() => {
    process.stderr.write(JSON.stringify({ passed: false, reason: "hard_runtime_ceiling", isolatedDatabase: databaseName, recovery: "Inspect only this run-owned local database; other fixtures are unchanged" }) + "\n");
    process.exit(1);
  }, PILOT_RUNTIME_MS);
  hardDeadline.unref();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External HTTP is disabled in the scripted pilot drill"); };
  let created = false;
  let active = 0, activeHighWater = 0, backlogHighWater = 0, queueHighWater = 0, duplicateReceipts = 0;
  const ingested = new Map<string, number>(), firstStarted = new Map<string, number>(), completedAt = new Map<string, number>();
  const attempts = new Map<string, number>(), accepted = new Map<string, number>(), rejected = new Set<string>();
  const ingressLatencies: number[] = [];
  const people: Array<{ id: string; marker: string; phone: string; fault: boolean; messageIds: string[]; completed: string[] }> = [];
  let healthyCompletedBeforeRecovery = 0, firstRecoveryAt: number | null = null;
  let workloadStarted = 0;
  let report: string | undefined;
  const check = () => { abort.signal.throwIfAborted(); assert.deepEqual(errors, []); };
  const transport: MessagingTransport = {
    getCapabilities: () => TEXT_ONLY_CAPABILITIES,
    send: async input => {
      const person = people.find(person => person.phone === input.to);
      assert.ok(person, "Only a synthetic account may receive captured output");
      await delay(person.fault ? 350 : 100, undefined, { signal: abort.signal });
      input.signal?.throwIfAborted();
      if (person.fault && !rejected.has(input.idempotencyKey)) {
        rejected.add(input.idempotencyKey);
        throw Object.assign(new Error("SCRIPTED transient provider rejection before acceptance"), { submissionOutcome: "not_accepted" });
      }
      accepted.set(input.idempotencyKey, (accepted.get(input.idempotencyKey) ?? 0) + 1);
      assert.equal(accepted.get(input.idempotencyKey), 1, "Duplicate captured provider acceptance");
      return { provider: "test", providerMessageSid: randomUUID(), status: "queued" };
    },
  };
  try {
    phase = "database_create";
    await admin.query(`CREATE DATABASE "${databaseName}"`); created = true;
    phase = "migrations";
    await migrate(database, { migrationsFolder: "drizzle" }); check();
    phase = "queue_registration";
    await boss.start();
    // Retry timing is accelerated for this synthetic drill; production uses
    // six attempts, a 60-second retry delay and a ten-minute expiry.
    await boss.createQueue(JOB_NAMES.processInbound, { policy: "key_strict_fifo", retryLimit: 2, retryDelay: 1, retryBackoff: false, expireInSeconds: 30 });
    await boss.work<ProcessInboundJob>(JOB_NAMES.processInbound, { localConcurrency: 4, pollingIntervalSeconds: 0.5 }, async jobs => {
      for (const job of jobs) {
        const person = people.find(person => person.id === job.data.userId)!;
        assert.ok(person);
        active += 1; activeHighWater = Math.max(activeHighWater, active);
        const actions = new ScheduledActionRepository(database);
        attempts.set(job.data.messageId, (attempts.get(job.data.messageId) ?? 0) + 1);
        if (!firstStarted.has(job.data.messageId)) firstStarted.set(job.data.messageId, performance.now());
        try {
          check(); assert.ok(active <= 4, "Consumer concurrency ceiling");
          assert.equal(await actions.markRunning(job.data.scheduledActionId), true);
          const web = await isWebMessage(job.data.messageId, database);
          const coach = new ConversationOrchestrator(new DrizzleConversationRepository(database), new DrizzleTaskRepository(database), new DrizzleGoalRepository(database), new DrizzleSchedulingRepository(database), {
            authorizer: { authorize: async () => ({ mode: "write", commands: ["create_task"] }) },
            parse: async input => {
              assert.deepEqual(input.openTasks.map(task => task.title), [person.marker]);
              assert.ok(input.history?.some(row => row.role === "assistant" && row.content.includes(person.marker) && row.replyToMessageId), "Chronological history must include the earlier durable reply");
              for (const other of people) if (other.id !== person.id) assert.ok(!JSON.stringify(input).includes(other.marker), "Cross-account context leak");
              await delay(100, undefined, { signal: abort.signal });
              return { kind: "conversation", reply: `[SCRIPTED] ${person.marker}` };
            },
          }, web ? new WebReplySender(job.data.messageId, database) : new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport), undefined, undefined, undefined, undefined, new DrizzleConversationHistoryRepository(database));
          await coach.process(job.data.messageId, job.signal);
          await actions.markCompleted(job.data.scheduledActionId);
          person.completed.push(job.data.messageId);
          completedAt.set(job.data.messageId, performance.now());
          if ((attempts.get(job.data.messageId) ?? 0) > 1 && firstRecoveryAt === null) firstRecoveryAt = performance.now();
          if (!person.fault && firstRecoveryAt === null) healthyCompletedBeforeRecovery += 1;
        } catch (error) {
          await actions.markFailed(job.data.scheduledActionId, error);
          // Only the deliberate rejection is expected. Record all other faults;
          // the drain loop will fail without logging private SQL or payloads.
          if (!(error instanceof Error && error.message === "SCRIPTED transient provider rejection before acceptance")) errors.push("unexpected_job_failure");
          throw error;
        } finally { active -= 1; }
      }
    });
    phase = "fixture_creation";
    for (let index = 0; index < config.accounts; index += 1) {
      check();
      const phone = `+1202555${String(100 + index).padStart(4, "0")}`;
      const [user] = await database.insert(schema.users).values({ phoneE164: phone, onboardingState: "complete", lastInboundAt: new Date(), phoneVerifiedAt: new Date() }).returning();
      await database.insert(schema.consentRecords).values({ userId: user.id, status: "granted", channel: "sms", disclosureVersion: "synthetic", termsVersion: "synthetic", privacyVersion: "synthetic" });
      people.push({ id: user.id, marker: `PRIVATE_${runId}_${index}_ONLY`, phone, fault: index % 10 === 0, messageIds: [], completed: [] });
    }
    phase = "ingress";
    workloadStarted = performance.now();
    await Promise.all(people.map(async person => {
      check();
      const ingressStarted = performance.now();
      const repository = new DrizzleMessagingRepository(database, PILOT_SYNTHETIC_ADMISSION);
      const input = { provider: "test" as const, providerMessageId: randomUUID(), from: person.phone, to: "+13035550100", body: `Add task ${person.marker}` };
      const receipts = await Promise.all([repository.ingestInbound(input), repository.ingestInbound(input)]);
      assert.equal(receipts.filter(receipt => receipt.duplicate).length, 1); duplicateReceipts += 1;
      await mutateWorkspace(person.id, { action: "chat", requestId: randomUUID(), text: "Please inspect my current plan" }, database);
      const rows = await database.select({ id: schema.conversationMessages.id }).from(schema.conversationMessages).where(eq(schema.conversationMessages.userId, person.id)).orderBy(schema.conversationMessages.createdAt, schema.conversationMessages.id);
      person.messageIds = rows.map(row => row.id); assert.equal(person.messageIds.length, PILOT_TURNS_PER_ACCOUNT);
      for (const id of person.messageIds) ingested.set(id, ingressStarted);
      ingressLatencies.push(performance.now() - ingressStarted);
    }));
    const ingressCompleted = performance.now();
    const sample = async () => {
      const pending = await pool.query<{ pending: number }>("select count(*)::int as pending from conversation_messages where direction='inbound' and status in ('received','processing')");
      backlogHighWater = Math.max(backlogHighWater, pending.rows[0].pending);
      // Read live rows rather than pg-boss's periodic statistics snapshots,
      // which can miss this short drill entirely.
      const queued = await pool.query<{ count: number }>("select count(*)::int as count from pgboss.job where name=$1 and state in ('created','retry','active')", [JOB_NAMES.processInbound]);
      queueHighWater = Math.max(queueHighWater, queued.rows[0].count);
    };
    phase = "drain";
    await sample();
    while (completedAt.size < config.accounts * PILOT_TURNS_PER_ACCOUNT) {
      check();
      await Promise.all([dispatchDueActions(boss, 25, database), dispatchDueActions(boss, 25, database)]);
      await sample();
      await delay(100, undefined, { signal: abort.signal });
    }
    check();
    // Wait for handler promises to return and pg-boss to persist completion.
    while (true) {
      check();
      const pending = await pool.query<{ count: number }>("select count(*)::int as count from pgboss.job where name=$1 and state <> 'completed'", [JOB_NAMES.processInbound]);
      if (pending.rows[0].count === 0) break;
      await delay(100, undefined, { signal: abort.signal });
    }
    phase = "invariants";
    const elapsedMs = performance.now() - workloadStarted;
    assert.equal(active, 0); assert.ok(activeHighWater <= 4);
    assert.equal(accepted.size, config.accounts); assert.equal(duplicateReceipts, config.accounts);
    assert.equal(rejected.size, people.filter(person => person.fault).length);
    assert.deepEqual(await boss.getBlockedKeys(JOB_NAMES.processInbound), []);
    for (const person of people) {
      assert.deepEqual(person.completed, person.messageIds, "Same-account completion chronology");
      const tasks = await database.select().from(schema.tasks).where(eq(schema.tasks.userId, person.id));
      assert.deepEqual(tasks.map(task => task.title), [person.marker]);
      const events = await database.select().from(schema.taskEvents).where(eq(schema.taskEvents.sourceMessageId, person.messageIds[0]));
      assert.equal(events.length, 1, "Retry must not duplicate the task mutation event");
      const replies = await database.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.userId, person.id));
      assert.equal(replies.filter(row => row.direction === "outbound").length, PILOT_TURNS_PER_ACCOUNT);
      assert.ok(replies.filter(row => row.direction === "outbound").every(row => row.body.includes(person.marker)));
    }
    const final = await pool.query<{ unfinishedActions: number; pendingInbound: number; uncertainOutbound: number }>(`select
      (select count(*)::int from scheduled_actions where kind='process_inbound_message' and status <> 'completed') as "unfinishedActions",
      (select count(*)::int from conversation_messages where direction='inbound' and status <> 'processed') as "pendingInbound",
      (select count(*)::int from conversation_messages where direction='outbound' and outbound_state in ('reserved','submitting','ambiguous')) as "uncertainOutbound"`);
    assert.deepEqual(final.rows[0], { unfinishedActions: 0, pendingInbound: 0, uncertainOutbound: 0 });
    const retries = [...attempts.values()].reduce((sum, count) => sum + count - 1, 0);
    assert.equal(retries, rejected.size);
    if (config.accounts > 1) assert.ok(healthyCompletedBeforeRecovery > 0, "Healthy accounts must progress before failed accounts recover");
    assert.ok(backlogHighWater > 4 || config.accounts <= 2, "Drill must actually exceed consumer capacity");
    report = JSON.stringify({ passed: true, evidence: "isolated real PostgreSQL/pg-boss; scripted parser and captured provider; accelerated retries; no hosted/provider capacity claim",
      accounts: config.accounts, inboundTurns: completedAt.size, duplicateReceipts, capturedProviderAcceptances: accepted.size, transientRejections: rejected.size, retries,
      consumers: 4, dispatchers: 2, runtimeCeilingMs: PILOT_RUNTIME_MS, activeHighWater, backlogHighWater, queueHighWater, healthyCompletedBeforeRecovery,
      ingressBatchMs: Math.round(ingressCompleted - workloadStarted), workloadElapsedMs: Math.round(elapsedMs), setupAndWorkloadMs: Math.round(performance.now() - started),
      turnsPerSecond: Number((completedAt.size / (elapsedMs / 1000)).toFixed(2)),
      ingressPerAccount: latencySummary(ingressLatencies),
      firstStart: latencySummary([...firstStarted].map(([id, at]) => at - ingested.get(id)!)),
      completion: latencySummary([...completedAt].map(([id, at]) => at - ingested.get(id)!)), final: final.rows[0], blockedAccounts: 0, isolatedDatabaseRemoved: true,
    }, null, 2) + "\n";
  } finally {
    clearTimeout(deadline); abort.abort();
    try { await boss.stop({ graceful: true, timeout: 1_000 }); }
    finally {
      await pool.end();
      try {
        if (created) { assertPilotOwnedDatabase(databaseName, runId); await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); }
      } finally { await admin.end(); globalThis.fetch = originalFetch; clearTimeout(hardDeadline); }
    }
  }
  // Emit success only after the run-owned database was removed successfully.
  assert.ok(report);
  process.stdout.write(report);
}

main().catch(error => {
  // First-line diagnostics retain the failed invariant/setup cause without
  // dumping assertion values, SQL, credentials, message bodies or phone numbers.
  const diagnostic = error instanceof Error ? error.message.split("\n")[0] : "Unknown failure";
  process.stderr.write(JSON.stringify({ passed: false, phase, diagnostic }) + "\n");
  process.exitCode = 1;
});
