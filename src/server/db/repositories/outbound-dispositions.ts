import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";

const exactUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const legacyRows = 35;
const legacyAccounts = 2;
export const dispositionRef = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
export const dispositionDecision = z.enum(["close_unresolved_without_replay", "reopen"]);
const failedReminderSnapshot = z.object({
  id: z.uuid().transform(value => value.toLowerCase()),
  status: z.literal("failed"),
  updatedAt: z.string().regex(exactUtc).refine(value => Number.isFinite(Date.parse(value))),
  keyShape: z.enum(["legacy_reminder_key", "occurrence_reminder_key", "unverified"]),
}).strict();
const manifestRow = z.object({
  accountId: z.uuid().transform(value => value.toLowerCase()),
  messageId: z.uuid().transform(value => value.toLowerCase()),
  messageUpdatedAt: z.string().regex(exactUtc).refine(value => Number.isFinite(Date.parse(value))),
  expectedLatestEventId: z.string().regex(/^[1-9][0-9]{0,18}$/)
    .refine(value => value.length < 19 || value <= "9223372036854775807").nullable(),
  linkedFailedReminder: failedReminderSnapshot.nullable().optional(),
}).strict();
const manifestSchema = z.object({
  version: z.literal(1),
  decision: dispositionDecision,
  approvalRef: dispositionRef,
  rows: z.array(manifestRow).min(1).max(legacyRows),
}).strict().refine(value => new Set(value.rows.map(row => row.messageId)).size === value.rows.length);

export function canonicalDispositionManifest(raw: unknown) {
  const input = manifestSchema.parse(raw);
  const rows = [...input.rows].sort((a, b) => a.messageId < b.messageId ? -1 : a.messageId > b.messageId ? 1 : 0);
  const manifest = { version: input.version, decision: input.decision, approvalRef: input.approvalRef, rows };
  return { manifest, sha256: createHash("sha256").update(JSON.stringify(manifest)).digest("hex") };
}

// Scope to the reviewed pre-0024 cohort shape. This predicate alone never
// exempts a row. Only a latest audited event for the exact unchanged row can.
const legacyShape = `
  m.direction = 'outbound' and m.status = 'failed' and m.outbound_state = 'ambiguous'
  and m.provider is null and m.provider_message_sid is null
  and m.submission_started_at is null and m.submission_token is null
  and m.created_at >= timestamptz '2026-08-20T00:00:00Z'
  and m.updated_at >= m.created_at and m.updated_at < timestamptz '2026-10-01T00:00:00Z'
`;
const legacyCandidate = `${legacyShape}
  and m.idempotency_key is not null and length(m.idempotency_key) > 0
  and exists (select 1 from conversations c where c.id = m.conversation_id and c.owner_user_id = m.user_id and c.type = 'direct')
  and not exists (select 1 from provider_message_bindings b where b.message_id = m.id)
  and (m.related_reminder_id is null or exists (
    select 1 from reminders r where r.id = m.related_reminder_id and r.user_id = m.user_id
  ))
`;

const relatedInbound = `
  i.direction = 'inbound' and i.user_id = m.user_id and i.conversation_id = m.conversation_id
  and (m.idempotency_key = 'reply:' || i.id::text or exists (
    select 1 from message_relations r where r.source_message_id = m.id and r.target_message_id = i.id
      and r.conversation_id = m.conversation_id and r.type = 'reply'
  ))
`;
const relatedAction = `
  a.user_id = m.user_id and (
    a.idempotency_key = m.idempotency_key or a.payload->>'messageId' = m.id::text
    or a.payload->>'messageId' in (select i.id::text from conversation_messages i where ${relatedInbound})
    or a.reminder_id = m.related_reminder_id or a.payload->>'reminderId' = m.related_reminder_id::text
    or a.intervention_id = m.related_intervention_id or a.payload->>'interventionId' = m.related_intervention_id::text
  )
`;

const relatedQueueJob = `
  ((j.singleton_key = m.user_id::text or j.data->>'userId' = m.user_id::text) and (
    j.data->>'idempotencyKey' = m.idempotency_key or j.data->>'messageId' = m.id::text
    or j.data->>'messageId' in (select i.id::text from conversation_messages i where ${relatedInbound})
    or j.data->>'reminderId' = m.related_reminder_id::text
    or j.data->>'interventionId' = m.related_intervention_id::text
  ))
  or exists (select 1 from scheduled_actions a where ${relatedAction}
    and (a.queue_job_id = j.id::text or a.id::text = j.data->>'scheduledActionId'))
`;

const ownedReminder = "r.id = m.related_reminder_id and r.user_id = m.user_id";
const failedReminderKeyShape = `case
  when m.idempotency_key = 'reminder-sms:' || r.id::text then 'legacy_reminder_key'
  when m.idempotency_key ~ ('^reminder-sms:' || r.id::text || ':[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$')
    then 'occurrence_reminder_key'
  else 'unverified' end`;
// A failed reminder alone cannot enqueue delivery. Durable action and queue
// retries are checked separately. Keep unfamiliar failure links fail-closed.
const activeReminderStatus = `r.status in ('scheduled','sending')
  or (r.status = 'failed' and (${failedReminderKeyShape}) = 'unverified')`;
const failedReminderEvidence = `select jsonb_build_object(
    'id', r.id, 'status', r.status,
    'updatedAt', to_char(r.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'keyShape', (${failedReminderKeyShape})
  ) from reminders r where ${ownedReminder} and r.status = 'failed'`;

const activeWork = `
  exists (select 1 from conversation_messages i where ${relatedInbound}
    and (i.status in ('received','processing') or i.processing_token is not null))
  or exists (select 1 from scheduled_actions a where ${relatedAction} and a.status in ('scheduled','running','failed'))
  or exists (select 1 from reminders r where ${ownedReminder} and (${activeReminderStatus}))
  or exists (select 1 from interventions i where i.id = m.related_intervention_id and i.user_id = m.user_id
    and i.status in ('candidate','queued'))
  or exists (
    select 1 from pgboss.job j where j.state in ('created','retry','active','failed')
      and (${relatedQueueJob})
  )
`;

export const historicalDispositionDiagnosticScope = {
  legacyShape, legacyRows, legacyAccounts, activeWork, relatedInbound, relatedAction, relatedQueueJob,
  ownedReminder, activeReminderStatus, failedReminderKeyShape,
};

export const outboundAcknowledgedSql = `
  select count(*)::int as "acknowledgedHistoricalOutbound"
  from conversation_messages m
  join lateral (
    select e.decision, e.message_updated_at from outbound_disposition_events e
    where e.message_id = m.id order by e.id desc limit 1
  ) latest on latest.decision = 'close_unresolved_without_replay' and latest.message_updated_at = m.updated_at
  where ${legacyCandidate} and not (${activeWork})
`;

type ReadClient = Pick<PoolClient, "query">;
async function readDispositionSchema(client: ReadClient) {
  const [row] = (await client.query<{ events: boolean; queue: boolean }>(`
    select pg_catalog.to_regclass('public.outbound_disposition_events') is not null as events,
      pg_catalog.to_regclass('pgboss.job') is not null as queue
  `)).rows;
  return row;
}

export async function dispositionSchemaAvailable(client: ReadClient) {
  const schema = await readDispositionSchema(client);
  return schema.events && schema.queue;
}

const targets = `jsonb_to_recordset($1::jsonb) as x(
  "accountId" uuid, "messageId" uuid, "messageUpdatedAt" timestamptz, "expectedLatestEventId" text, "linkedFailedReminder" jsonb
)`;

type DecisionOptions = { apply?: false } | {
  apply: true; expectedSha256: string; acknowledge: string; operatorRef: string;
};
type DispositionTarget = {
  eligible: boolean;
  stateMatches: boolean;
  hasActiveWork: boolean;
  latestId: string | null;
  latestDecision: z.infer<typeof dispositionDecision> | null;
  latestDigest: string | null;
  expectedLatestEventId: string | null;
};

async function inspectTargets(client: ReadClient, json: string, close: boolean, hasEvents: boolean) {
  const latest = hasEvents
    ? `select e.id, e.decision, e.manifest_sha256 from outbound_disposition_events e
       where e.message_id = m.id order by e.id desc limit 1`
    : "select null::bigint as id, null::text as decision, null::text as manifest_sha256";
  return (await client.query<DispositionTarget>(`
    select (${legacyCandidate}) as eligible,
      (m.updated_at = x."messageUpdatedAt"
        ${close ? `and (${failedReminderEvidence}) is not distinct from x."linkedFailedReminder"` : ""}) as "stateMatches",
      ${close ? `(${activeWork})` : "false"} as "hasActiveWork",
      latest.id::text as "latestId", latest.decision as "latestDecision", latest.manifest_sha256 as "latestDigest",
      x."expectedLatestEventId"
    from ${targets} join conversation_messages m on m.id = x."messageId" and m.user_id = x."accountId" and m.direction = 'outbound'
    left join lateral (${latest}) latest on true
  `, [json])).rows;
}

async function boundSnapshot(client: ReadClient) {
  await client.query("SET LOCAL statement_timeout = '5s'");
  await client.query("SET LOCAL lock_timeout = '1s'");
}

/** Prepare only the exact historical investigation cohort, before or after migration. */
export async function prepareLegacyOutboundDisposition(client: ReadClient, rawApprovalRef: unknown) {
  const approvalRef = dispositionRef.parse(rawApprovalRef);
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await boundSnapshot(client);
    const schema = await readDispositionSchema(client);
    if (!schema.queue) throw new Error("disposition_or_queue_schema_unavailable");
    const { rows } = await client.query<z.input<typeof manifestRow>>(`
      select m.user_id as "accountId", m.id as "messageId",
        to_char(m.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "messageUpdatedAt",
        null::text as "expectedLatestEventId", (${failedReminderEvidence}) as "linkedFailedReminder"
      from conversation_messages m join users u on u.id = m.user_id
      where ${legacyShape} order by m.id limit ${legacyRows + 1}
    `);
    const accountCount = new Set(rows.map(row => row.accountId)).size;
    const scope = { observedRows: rows.length, observedAccounts: accountCount, dispositionSchemaAvailable: schema.events };
    if (rows.length !== legacyRows || accountCount !== legacyAccounts) {
      await client.query("COMMIT");
      return { report: { ...scope, eligible: false, outcome: "historical_cohort_changed" }, manifest: undefined };
    }
    const { manifest, sha256 } = canonicalDispositionManifest({ version: 1, decision: "close_unresolved_without_replay", approvalRef, rows });
    const reviewed = await inspectTargets(client, JSON.stringify(manifest.rows), true, schema.events);
    const unverifiedRows = rows.length - reviewed.filter(row => row.eligible && row.stateMatches).length;
    const linkedWorkRows = reviewed.filter(row => row.hasActiveWork).length;
    const priorDispositionRows = reviewed.filter(row => row.latestId !== null).length;
    const failedReminderKeyRows = { legacy_reminder_key: 0, occurrence_reminder_key: 0, unverified: 0 };
    const failedReminderRows = manifest.rows.flatMap(row => row.linkedFailedReminder ? [row.linkedFailedReminder] : []);
    for (const reminder of failedReminderRows) failedReminderKeyRows[reminder.keyShape] += 1;
    const eligible = unverifiedRows === 0 && linkedWorkRows === 0 && priorDispositionRows === 0;
    await client.query("COMMIT");
    return { report: { ...scope, eligible, outcome: eligible ? "exact_manifest_verified_for_review" : "historical_review_blocked",
      manifestVersion: manifest.version, decision: manifest.decision, ...(eligible ? { sha256 } : {}), unverifiedRows, linkedWorkRows, priorDispositionRows,
      linkedFailedReminderRows: failedReminderRows.length, failedReminderKeyRows },
      ...(eligible ? { manifest } : {}) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

/** Run a default read-only preview or append an owner-approved atomic batch. */
export async function recordOutboundDisposition(client: ReadClient, input: unknown, options: DecisionOptions = {}) {
  const { manifest, sha256 } = canonicalDispositionManifest(input);
  if (options.apply && (options.expectedSha256 !== sha256 || options.acknowledge !== manifest.decision)) {
    throw new Error("manifest_acknowledgment_mismatch");
  }
  const operatorRef = options.apply ? dispositionRef.parse(options.operatorRef) : undefined;
  const json = JSON.stringify(manifest.rows);
  await client.query(options.apply ? "BEGIN ISOLATION LEVEL READ COMMITTED" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await boundSnapshot(client);
    const schema = await readDispositionSchema(client);
    const close = manifest.decision === "close_unresolved_without_replay";
    if (!schema.queue || (!schema.events && (options.apply || !close))) throw new Error("disposition_or_queue_schema_unavailable");
    if (options.apply) {
      // After waiting for any prior operator, the later read sees the latest
      // event under READ COMMITTED. Account/message locks remain held until commit.
      const accounts = [...new Set(manifest.rows.map(row => row.accountId))].sort();
      // NO KEY UPDATE still serializes account writers and allows the key-share
      // FK check of a reminder transaction that already holds a reminder row.
      await client.query("select id from users where id = any($1::uuid[]) order by id for no key update", [accounts]);
      await client.query(`select m.id from ${targets}
        join conversation_messages m on m.id = x."messageId" and m.user_id = x."accountId"
        order by m.id for update of m`, [json]);
      if (close) {
        await client.query(`select r.id from reminders r where exists (
          select 1 from ${targets} join conversation_messages m on m.id = x."messageId" and m.user_id = x."accountId"
          where ${ownedReminder}
        ) order by r.id for share of r`, [json]);
      }
    }
    const rows = await inspectTargets(client, json, close, schema.events);
    if (rows.length !== manifest.rows.length || rows.some(row => !row.stateMatches || (close && !row.eligible))) {
      throw new Error("manifest_target_unverified");
    }
    if (close && rows.some(row => row.hasActiveWork)) throw new Error("linked_work_pending");
    const alreadyRecorded = rows.every(row => row.latestDigest === sha256 && row.latestDecision === manifest.decision);
    if (!alreadyRecorded && rows.some(row => row.latestId !== row.expectedLatestEventId
        || (close ? row.latestDecision === manifest.decision : row.latestDecision !== "close_unresolved_without_replay"))) {
      throw new Error("manifest_latest_disposition_mismatch");
    }
    if (options.apply && !alreadyRecorded) {
      const inserted = await client.query(`
        insert into outbound_disposition_events (
          message_id, decision, manifest_version, manifest_sha256, approval_ref, operator_ref, message_updated_at
        )
        select m.id, $2, $3, $4, $5, $6, m.updated_at
        from ${targets} join conversation_messages m on m.id = x."messageId" and m.user_id = x."accountId"
        order by m.id
      `, [json, manifest.decision, manifest.version, sha256, manifest.approvalRef, operatorRef]);
      if (inserted.rowCount !== manifest.rows.length) throw new Error("manifest_target_unverified");
    }
    await client.query("COMMIT");
    return { decision: manifest.decision, manifestVersion: manifest.version, sha256, reviewedRows: rows.length,
      applied: Boolean(options.apply && !alreadyRecorded), alreadyRecorded, deliveryStateUnchanged: true, dispositionSchemaAvailable: schema.events };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
