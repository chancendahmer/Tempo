import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import { expect, it } from "vitest";
import { pilotLoadConfig } from "../../../../scripts/pilot-load-config";
import { TestSmsTransport } from "../../adapters/sms/sms-transport";
import { OutboundDeliveryPendingError, SafeSmsSender } from "../../domain/outbound-messaging";
import { queueHealthProblems } from "../../domain/queue-health";
import { JOB_NAMES } from "../../jobs/names";
import * as schema from "../schema";
import { ensureDirectConversation } from "./messaging-identity-repository";
import { DrizzleReminderRepository } from "./reminder-repository";
import { OperationalRepository } from "./operational-repository";
import { canonicalDispositionManifest, prepareLegacyOutboundDisposition, recordOutboundDisposition } from "./outbound-dispositions";
import { DrizzleOutboundMessageRepository } from "./outbound-message-repository";
import { diagnoseHistoricalLinkedWork } from "./outbound-linked-work-diagnostic";

const fixtureUrl = process.env.TEST_DATABASE_URL;
const messageUpdatedAt = "2026-09-03T12:00:00.002123Z";
const close = "close_unresolved_without_replay" as const;
const makeTarget = () => ({ accountId: randomUUID(), messageId: randomUUID(), messageUpdatedAt, expectedLatestEventId: null });

it("canonicalizes exact scope and includes expected disposition generation in the approved hash", () => {
  const rows = [makeTarget(), makeTarget()];
  const manifest = { version: 1, decision: close, approvalRef: "review-fixture", rows };
  const hash = canonicalDispositionManifest(manifest).sha256;
  expect(canonicalDispositionManifest({ ...manifest, rows: rows.toReversed() }).sha256).toBe(hash);
  expect(canonicalDispositionManifest({ ...manifest, rows: [{ ...rows[0], expectedLatestEventId: "1" }, rows[1]] }).sha256).not.toBe(hash);
  expect(() => canonicalDispositionManifest({ ...manifest, rows: [rows[0], rows[0]] })).toThrow();
  const linkedFailedReminder = { id: randomUUID(), status: "failed", updatedAt: messageUpdatedAt, keyShape: "legacy_reminder_key" };
  expect(canonicalDispositionManifest({ ...manifest, rows: [{ ...rows[0], linkedFailedReminder }, rows[1]] }).sha256).not.toBe(hash);
  expect(() => canonicalDispositionManifest({ ...manifest, rows: [{ ...rows[0], messageUpdatedAt: "2026-09-03T12:00:00.002Z" }] })).toThrow();
});

it.skipIf(!fixtureUrl)("real PostgreSQL: audited closure and reopen preserve the ledger and never exempt live or linked work", async () => {
  const { adminUrl } = pilotLoadConfig(["--database", fixtureUrl!]);
  const name = `tempo_disposition_${randomUUID().replaceAll("-", "")}_test`;
  const assertOwned = () => expect(name).toMatch(/^tempo_disposition_[a-f0-9]{32}_test$/);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const admin = new Pool({ connectionString: adminUrl, max: 1, query_timeout: 5_000 });
  const pool = new Pool({ connectionString: url.toString(), max: 4, query_timeout: 8_000 });
  const boss = new PgBoss({ connectionString: url.toString(), schema: "pgboss", schedule: false, supervise: false });
  let created = false;
  let started = false;
  try {
    assertOwned();
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const database = drizzle(pool, { schema });
    await migrate(database, { migrationsFolder: "drizzle" });
    await boss.start();
    started = true;
    await boss.createQueue(JOB_NAMES.sendWelcome);
    await boss.createQueue(JOB_NAMES.deliverReminder);
    const [user, other] = await database.insert(schema.users).values([
      { phoneE164: "+12025550171" }, { phoneE164: "+12025550172" },
    ]).returning();
    await database.insert(schema.consentRecords).values([user, other].map(account => ({
      userId: account.id, status: "granted" as const, channel: "sms" as const,
      disclosureVersion: "synthetic", termsVersion: "synthetic", privacyVersion: "synthetic",
    })));
    const { conversationId } = await ensureDirectConversation(database, { userId: user.id, phoneE164: user.phoneE164 });
    const legacy = {
      userId: user.id, conversationId, direction: "outbound" as const, kind: "coach" as const,
      status: "failed" as const, outboundState: "ambiguous" as const, body: "Synthetic archived message",
      createdAt: new Date("2026-09-03T12:00:00Z"), updatedAt: new Date(messageUpdatedAt),
    };
    const [first, second, current] = await database.insert(schema.conversationMessages).values([
      { ...legacy, idempotencyKey: "archive-first" }, { ...legacy, idempotencyKey: "archive-second" },
      { ...legacy, idempotencyKey: "current-unresolved", submissionStartedAt: new Date(), submissionToken: randomUUID() },
    ]).returning();
    await pool.query("update conversation_messages set updated_at = $1 where id = any($2::uuid[])", [messageUpdatedAt, [first.id, second.id, current.id]]);
    const rows = [first, second].map(message => ({ accountId: user.id, messageId: message.id, messageUpdatedAt, expectedLatestEventId: null as string | null }));
    const manifest = { version: 1, decision: close, approvalRef: "synthetic-reviewed-batch", rows };
    const digest = canonicalDispositionManifest(manifest).sha256;
    const apply = (input = manifest) => ({ apply: true as const, expectedSha256: canonicalDispositionManifest(input).sha256,
      acknowledge: input.decision, operatorRef: "synthetic-operator" });
    const record = async (input: unknown, options?: Parameters<typeof recordOutboundDisposition>[2]) => {
      const client = await pool.connect();
      try { return await recordOutboundDisposition(client, input, options); }
      finally { client.release(); }
    };
    const operations = new OperationalRepository(database);
    const health = async (acknowledged: number) => {
      const snapshot = await operations.messageHealth();
      expect(snapshot).toMatchObject({ ambiguousOutbound: 3, acknowledgedHistoricalOutbound: acknowledged });
      expect(queueHealthProblems({ ...snapshot, blockedAccounts: 0 })).toContain("outbound_reconciliation_required");
    };
    await health(0);
    expect(await record(manifest)).toMatchObject({ applied: false, alreadyRecorded: false, sha256: digest, reviewedRows: 2 });
    expect(await database.select().from(schema.outboundDispositionEvents)).toHaveLength(0);
    await expect(record(manifest, { ...apply(), expectedSha256: "f".repeat(64) })).rejects.toThrow("manifest_acknowledgment_mismatch");
    await expect(record({ ...manifest, rows: [{ ...rows[0], accountId: other.id }] })).rejects.toThrow("manifest_target_unverified");
    await expect(record({ ...manifest, rows: [{ ...rows[0], messageId: current.id }] })).rejects.toThrow("manifest_target_unverified");
    await expect(record({ ...manifest, rows: [{ ...rows[0], messageUpdatedAt: "2026-09-03T12:00:00.002000Z" }] })).rejects.toThrow("manifest_target_unverified");

    const [action] = await database.insert(schema.scheduledActions).values({ userId: user.id, kind: "send_welcome",
      idempotencyKey: second.idempotencyKey!, runAt: new Date() }).returning();
    await expect(record(manifest, apply())).rejects.toThrow("linked_work_pending");
    expect(await database.select().from(schema.outboundDispositionEvents)).toHaveLength(0);
    await database.update(schema.scheduledActions).set({ status: "cancelled" }).where(eq(schema.scheduledActions.id, action.id));
    const jobId = await boss.send(JOB_NAMES.sendWelcome, { userId: user.id, idempotencyKey: second.idempotencyKey }, { singletonKey: user.id });
    expect(jobId).toBeTruthy();
    await expect(record(manifest, apply())).rejects.toThrow("linked_work_pending");
    await boss.cancel(JOB_NAMES.sendWelcome, jobId!);

    const originalRows = await database.select().from(schema.conversationMessages).orderBy(schema.conversationMessages.id);
    expect(await record(manifest, apply())).toMatchObject({ applied: true, deliveryStateUnchanged: true });
    expect(await record(manifest, apply())).toMatchObject({ applied: false, alreadyRecorded: true });
    expect(await database.select().from(schema.conversationMessages).orderBy(schema.conversationMessages.id)).toEqual(originalRows);
    await health(2);
    const transport = new TestSmsTransport();
    await expect(new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport).send({
      userId: user.id, body: first.body, kind: "coach", idempotencyKey: first.idempotencyKey!,
    })).rejects.toBeInstanceOf(OutboundDeliveryPendingError);
    expect(transport.sent).toHaveLength(0);

    // Fresh related work revokes the readiness exemption without changing history.
    await database.update(schema.scheduledActions).set({ status: "scheduled" }).where(eq(schema.scheduledActions.id, action.id));
    await health(1);
    await database.update(schema.scheduledActions).set({ status: "cancelled" }).where(eq(schema.scheduledActions.id, action.id));
    const events = await database.select().from(schema.outboundDispositionEvents);
    const reopen = { version: 1, decision: "reopen" as const, approvalRef: "synthetic-reopened-batch",
      rows: rows.map(row => ({ ...row, expectedLatestEventId: events.find(event => event.messageId === row.messageId)!.id.toString() })) };
    expect(await record(reopen, { apply: true, expectedSha256: canonicalDispositionManifest(reopen).sha256,
      acknowledge: "reopen", operatorRef: "synthetic-operator" })).toMatchObject({ applied: true, deliveryStateUnchanged: true });
    await health(0);
    await expect(record(manifest, apply())).rejects.toThrow("manifest_latest_disposition_mismatch");
    const later = await database.select().from(schema.outboundDispositionEvents).where(eq(schema.outboundDispositionEvents.decision, "reopen"));
    const secondClose = { ...manifest, approvalRef: "synthetic-second-review",
      rows: rows.map(row => ({ ...row, expectedLatestEventId: later.find(event => event.messageId === row.messageId)!.id.toString() })) };
    const competing = { ...secondClose, approvalRef: "synthetic-competing-review" };
    const race = await Promise.allSettled([record(secondClose, apply(secondClose)), record(competing, apply(competing))]);
    expect(race.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(race.filter(result => result.status === "rejected")).toHaveLength(1);
    await health(2);
    await pool.query("update conversation_messages set updated_at = $1 where id = $2", ["2026-09-03T12:00:00.002124Z", first.id]);
    await health(1);
    expect(await database.select().from(schema.outboundDispositionEvents)).toHaveLength(6);

    const otherConversation = await ensureDirectConversation(database, { userId: other.id, phoneE164: other.phoneE164 });
    const remindAt = new Date("2026-09-03T12:00:00.000Z");
    const [legacyReminder, occurrenceReminder] = await database.insert(schema.reminders).values(
      ["legacy", "occurrence"].map(kind => ({ userId: other.id, text: "Synthetic retained reminder", timezone: "UTC",
        remindAt, status: "failed" as const, idempotencyKey: `archive-reminder:${kind}` })),
    ).returning();
    await pool.query("update reminders set updated_at = $1 where id = any($2::uuid[])",
      [messageUpdatedAt, [legacyReminder.id, occurrenceReminder.id]]);
    const reminderKeys = [`reminder-sms:${legacyReminder.id}`, `reminder-sms:${occurrenceReminder.id}:${remindAt.toISOString()}`];
    const [legacyReminderMessage, occurrenceReminderMessage] = await database.insert(schema.conversationMessages).values([
      ...[legacyReminder, occurrenceReminder].map((reminder, index) => ({
        ...legacy, userId: other.id, conversationId: otherConversation.conversationId,
        idempotencyKey: reminderKeys[index], relatedReminderId: reminder.id,
      })),
      ...Array.from({ length: 31 }, (_, index) => ({
        ...legacy, userId: other.id, conversationId: otherConversation.conversationId, idempotencyKey: `archive-other:${index}`,
      })),
    ]).returning();
    await pool.query("alter table outbound_disposition_events rename to outbound_disposition_events_fixture_saved");
    const client = await pool.connect();
    try {
      const preview = await prepareLegacyOutboundDisposition(client, "synthetic-pre-migration");
      expect(preview.report).toMatchObject({ eligible: true, observedRows: 35, observedAccounts: 2, dispositionSchemaAvailable: false,
        unverifiedRows: 0, linkedWorkRows: 0, priorDispositionRows: 0,
        linkedFailedReminderRows: 2, failedReminderKeyRows: { legacy_reminder_key: 1, occurrence_reminder_key: 1, unverified: 0 } });
      expect(preview.manifest?.rows.find(row => row.messageId === legacyReminderMessage.id)?.linkedFailedReminder).toEqual({
        id: legacyReminder.id, status: "failed", keyShape: "legacy_reminder_key", updatedAt: messageUpdatedAt,
      });
      const reviewedReminderRows = preview.manifest!.rows.filter(row => row.linkedFailedReminder !== null);
      expect(reviewedReminderRows).toHaveLength(2);
      const reminderManifest = { ...preview.manifest!, rows: reviewedReminderRows };
      await database.update(schema.conversationMessages).set({ idempotencyKey: `reminder-sms:${randomUUID()}` })
        .where(eq(schema.conversationMessages.id, legacyReminderMessage.id));
      expect((await prepareLegacyOutboundDisposition(client, "synthetic-unverified-reminder")).report)
        .toMatchObject({ eligible: false, linkedWorkRows: 1, failedReminderKeyRows: { unverified: 1 } });
      await database.update(schema.conversationMessages).set({ idempotencyKey: reminderKeys[0] })
        .where(eq(schema.conversationMessages.id, legacyReminderMessage.id));
      expect(await record(preview.manifest)).toMatchObject({ applied: false, reviewedRows: 35, dispositionSchemaAvailable: false });
      await expect(record(preview.manifest, { ...apply(), expectedSha256: canonicalDispositionManifest(preview.manifest).sha256 }))
        .rejects.toThrow("disposition_or_queue_schema_unavailable");
      await database.update(schema.scheduledActions).set({ status: "scheduled" }).where(eq(schema.scheduledActions.id, action.id));
      const blocked = await prepareLegacyOutboundDisposition(client, "synthetic-pre-migration");
      expect(blocked.report).toMatchObject({ eligible: false, linkedWorkRows: 1 });
      expect(blocked.report).not.toHaveProperty("sha256");
      expect(blocked.manifest).toBeUndefined();
      await database.update(schema.scheduledActions).set({ status: "failed", updatedAt: new Date("2026-01-01T00:00:00Z"),
        queueJobId: randomUUID() }).where(eq(schema.scheduledActions.id, action.id));
      const directJobId = await boss.send(JOB_NAMES.sendWelcome, { userId: user.id, idempotencyKey: first.idempotencyKey }, { singletonKey: user.id });
      const diagnostic = await diagnoseHistoricalLinkedWork(client);
      expect(diagnostic).toMatchObject({ complete: true, observedRows: 35, observedAccounts: 2, linkedWorkRows: 2, diagnosedRows: 2, totalGroups: 2,
        dormantFailedReminderKeyRows: { legacy_reminder_key: 1, occurrence_reminder_key: 1 } });
      expect(diagnostic.groups).toEqual([
        expect.objectContaining({ guard: "queue_job", relation: "same_idempotency", state: "created", kind: JOB_NAMES.sendWelcome, targetRows: 1 }),
        expect.objectContaining({ guard: "scheduled_action", relation: "same_idempotency", state: "failed", kind: "send_welcome",
          age: "90_days_or_older", queueEvidence: "queue_reference_without_job", targetRows: 1 }),
      ]);
      for (const privateValue of [user.id, first.id, second.id, action.id, directJobId!, first.body, legacyReminder.id, reminderKeys[0]]) {
        expect(JSON.stringify(diagnostic)).not.toContain(privateValue);
      }
      await pool.query("alter table outbound_disposition_events_fixture_saved rename to outbound_disposition_events");
      const reminderApply = { ...apply(), expectedSha256: canonicalDispositionManifest(reminderManifest).sha256 };
      const [reminderAction] = await database.insert(schema.scheduledActions).values({
        userId: other.id, reminderId: occurrenceReminder.id, kind: "deliver_reminder", idempotencyKey: "archive-reminder-action",
        runAt: remindAt, status: "failed",
      }).returning();
      for (const status of ["failed", "scheduled", "running"] as const) {
        await database.update(schema.scheduledActions).set({ status }).where(eq(schema.scheduledActions.id, reminderAction.id));
        await expect(record(reminderManifest, reminderApply)).rejects.toThrow("linked_work_pending");
      }
      await database.update(schema.scheduledActions).set({ status: "cancelled" }).where(eq(schema.scheduledActions.id, reminderAction.id));
      const retryJob = await boss.send(JOB_NAMES.deliverReminder, {
        scheduledActionId: reminderAction.id, userId: other.id, reminderId: occurrenceReminder.id, occurrenceAt: remindAt.toISOString(),
      });
      expect(retryJob).toBeTruthy();
      for (const state of ["created", "retry", "active", "failed"]) {
        await pool.query("update pgboss.job set state = $1 where id = $2", [state, retryJob]);
        await expect(record(reminderManifest, reminderApply)).rejects.toThrow("linked_work_pending");
      }
      await pool.query("update pgboss.job set state = 'cancelled' where id = $1", [retryJob]);

      // An already-started reminder writer holds the reminder before its
      // scheduled-action owner FK check. The disposition waits without blocking
      // that check, then rejects the stale reviewed timestamp.
      const writer = await pool.connect();
      try {
        await writer.query("begin");
        await writer.query("update reminders set updated_at = $1 where id = $2", ["2026-09-03T12:00:00.002124Z", occurrenceReminder.id]);
        const outcome = record(reminderManifest, reminderApply).catch((error: unknown) => error);
        let waiting = false;
        for (let attempt = 0; attempt < 30 && !waiting; attempt++) {
          const { rows: [row] } = await pool.query<{ waiting: boolean }>(`select exists (
            select 1 from pg_stat_activity where datname = current_database()
              and wait_event_type = 'Lock' and query like '%order by r.id for share of r%'
          ) as waiting`);
          waiting = row.waiting;
          if (!waiting) await new Promise(resolve => setTimeout(resolve, 15));
        }
        expect(waiting).toBe(true);
        await writer.query("insert into scheduled_actions (user_id, reminder_id, kind, idempotency_key, run_at, status) values ($1,$2,'deliver_reminder','archive-reminder-lock-proof',now(),'cancelled')",
          [other.id, occurrenceReminder.id]);
        await writer.query("commit");
        expect(await outcome).toMatchObject({ message: "manifest_target_unverified" });
      } finally {
        await writer.query("rollback").catch(() => undefined);
        writer.release();
      }
      await pool.query("update reminders set updated_at = $1 where id = $2", [messageUpdatedAt, occurrenceReminder.id]);
      const reminderBefore = await database.select().from(schema.reminders).orderBy(schema.reminders.id);
      const messagesBefore = await database.select().from(schema.conversationMessages).orderBy(schema.conversationMessages.id);
      const acknowledgedBefore = (await operations.messageHealth()).acknowledgedHistoricalOutbound;
      expect(await record(reminderManifest, reminderApply)).toMatchObject({ applied: true });
      expect(await database.select().from(schema.reminders).orderBy(schema.reminders.id)).toEqual(reminderBefore);
      expect(await database.select().from(schema.conversationMessages).orderBy(schema.conversationMessages.id)).toEqual(messagesBefore);
      expect((await operations.messageHealth()).acknowledgedHistoricalOutbound).toBe(acknowledgedBefore! + 2);

      const [rescheduleSource] = await database.insert(schema.conversationMessages).values({
        userId: other.id, conversationId: otherConversation.conversationId, direction: "inbound", kind: "user",
        status: "processed", body: "Synthetic reminder reschedule",
      }).returning();
      const now = new Date();
      expect(await new DrizzleReminderRepository(database).update({
        userId: other.id, sourceMessageId: rescheduleSource.id, now, reminderId: occurrenceReminder.id,
        remindAt: new Date(now.getTime() + 60_000),
      })).toMatchObject({ kind: "updated", reminder: { status: "scheduled" } });
      expect((await operations.messageHealth()).acknowledgedHistoricalOutbound).toBe(acknowledgedBefore! + 1);
      const sameOccurrenceTransport = new TestSmsTransport();
      const sender = new SafeSmsSender(new DrizzleOutboundMessageRepository(database), sameOccurrenceTransport);
      for (const original of [legacyReminderMessage, occurrenceReminderMessage]) {
        await expect(sender.send({ userId: other.id, body: original.body, kind: "coach", idempotencyKey: original.idempotencyKey! }))
          .rejects.toBeInstanceOf(OutboundDeliveryPendingError);
      }
      expect(sameOccurrenceTransport.sent).toHaveLength(0);
    } finally { client.release(); }
  } finally {
    if (started) await boss.stop({ graceful: false });
    await pool.end();
    try { if (created) { assertOwned(); await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); } }
    finally { await admin.end(); }
  }
}, 30_000);
