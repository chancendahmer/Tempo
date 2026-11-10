import type { PoolClient } from "pg";
import { JOB_NAMES } from "../../jobs/names";
import { historicalDispositionDiagnosticScope as scope } from "./outbound-dispositions";

const maxGroups = 96;
const actionKinds = ["send_signin", "send_welcome", "send_compliance", "process_inbound_message", "deliver_reminder",
  "deliver_intervention", "accountability_followup", "feedback_followup", "feedback_timeout", "sync_calendar", "evaluate_context"];

/** Only fixed labels and aggregates leave the read-only snapshot. */
export async function diagnoseHistoricalLinkedWork(client: Pick<PoolClient, "query">) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '1s'");
    const [schema] = (await client.query<{ present: boolean }>("select pg_catalog.to_regclass('pgboss.job') is not null as present")).rows;
    if (!schema.present) throw new Error("queue_schema_unavailable");
    const [result] = (await client.query<{
      observedRows: number; observedAccounts: number; linkedWorkRows: number; diagnosedRows: number; totalGroups: number;
      dormantFailedReminderKeyRows: Record<string, number>;
      groups: Array<{ guard: string; relation: string; state: string; kind: string; age: string; queueEvidence: string; linkedRecords: number; targetRows: number }>;
    }>(`
      with observed as (
        select m.id, m.user_id, m.conversation_id, m.idempotency_key, m.related_reminder_id, m.related_intervention_id
        from conversation_messages m join users u on u.id = m.user_id
        where ${scope.legacyShape} order by m.id limit ${scope.legacyRows + 1}
      ), cohort as (
        select * from observed where (select count(*) from observed) = ${scope.legacyRows}
          and (select count(distinct user_id) from observed) = ${scope.legacyAccounts}
      ), dormant_reminders as (
        select (${scope.failedReminderKeyShape}) as key_shape, count(*)::int as target_rows
        from cohort m join reminders r on ${scope.ownedReminder}
        where r.status = 'failed' and not (${scope.activeWork})
        group by (${scope.failedReminderKeyShape})
      ), linked as (
        select m.id as target_id, i.id as linked_id, 'inbound' as guard,
          case when m.idempotency_key = 'reply:' || i.id::text then 'reply_idempotency' else 'owned_reply_relation' end as relation,
          case when i.status::text in ('received','processing','processed','cancelled','failed') then i.status::text else 'other' end as state,
          case when i.processing_token is null then 'no_lease_token'
            when i.processing_started_at is null then 'lease_start_unavailable'
            when i.processing_started_at > now() - interval '5 minutes' then 'recent_lease'
            else 'stale_lease_token' end as kind,
          i.updated_at as last_activity, 'not_applicable' as queue_evidence
        from cohort m join conversation_messages i on ${scope.relatedInbound}
        where i.status in ('received','processing') or i.processing_token is not null
        union all
        select m.id, a.id, 'scheduled_action',
          case when a.idempotency_key = m.idempotency_key then 'same_idempotency'
            when a.payload->>'messageId' = m.id::text then 'outbound_message_payload'
            when a.payload->>'messageId' in (select i.id::text from conversation_messages i where ${scope.relatedInbound}) then 'inbound_parent_payload'
            when a.reminder_id = m.related_reminder_id or a.payload->>'reminderId' = m.related_reminder_id::text then 'reminder_reference'
            else 'intervention_reference' end,
          a.status::text, case when a.kind = any($1::text[]) then a.kind else 'other' end, a.updated_at,
          case when exists (select 1 from pgboss.job j
            where (j.id::text = a.queue_job_id or j.data->>'scheduledActionId' = a.id::text)
              and j.state in ('created','retry','active','failed')) then 'active_or_failed_job_present'
            when exists (select 1 from pgboss.job j where j.id::text = a.queue_job_id or j.data->>'scheduledActionId' = a.id::text)
              then 'other_retained_job'
            when a.queue_job_id is not null then 'queue_reference_without_job'
            else 'no_queue_reference' end
        from cohort m join scheduled_actions a on ${scope.relatedAction}
        where a.status in ('scheduled','running','failed')
        union all
        select m.id, r.id, 'reminder', 'related_reminder', r.status::text, 'reminder', r.updated_at, 'not_applicable'
        from cohort m join reminders r on ${scope.ownedReminder}
        where (${scope.activeReminderStatus})
        union all
        select m.id, i.id, 'intervention', 'related_intervention', i.status::text, 'intervention', i.updated_at, 'not_applicable'
        from cohort m join interventions i on i.id = m.related_intervention_id and i.user_id = m.user_id
        where i.status in ('candidate','queued')
        union all
        select m.id, j.id, 'queue_job',
          case when exists (select 1 from scheduled_actions a where ${scope.relatedAction}
            and (a.queue_job_id = j.id::text or a.id::text = j.data->>'scheduledActionId')) then 'linked_action'
            when j.data->>'idempotencyKey' = m.idempotency_key then 'same_idempotency'
            when j.data->>'messageId' = m.id::text then 'outbound_message_payload'
            when j.data->>'messageId' in (select i.id::text from conversation_messages i where ${scope.relatedInbound}) then 'inbound_parent_payload'
            when j.data->>'reminderId' = m.related_reminder_id::text then 'reminder_reference'
            else 'intervention_reference' end,
          j.state::text, case when j.name = any($2::text[]) then j.name else 'other' end,
          coalesce(j.completed_on, j.started_on, j.created_on), 'job_present'
        from cohort m join pgboss.job j on (${scope.relatedQueueJob})
        where j.state in ('created','retry','active','failed')
      ), bucketed as (
        select *, case when last_activity is null then 'unknown' when last_activity > now() then 'future'
          when last_activity > now() - interval '7 days' then 'under_7_days'
          when last_activity > now() - interval '30 days' then '7_to_30_days'
          when last_activity > now() - interval '90 days' then '30_to_90_days'
          else '90_days_or_older' end as age from linked
      ), grouped as (
        select guard, relation, state, kind, age, queue_evidence as "queueEvidence",
          count(distinct linked_id)::int as "linkedRecords", count(distinct target_id)::int as "targetRows"
        from bucketed group by guard, relation, state, kind, age, queue_evidence
      )
      select (select count(*)::int from observed) as "observedRows",
        (select count(distinct user_id)::int from observed) as "observedAccounts",
        (select count(*)::int from cohort m where ${scope.activeWork}) as "linkedWorkRows",
        (select count(distinct target_id)::int from linked) as "diagnosedRows",
        (select count(*)::int from grouped) as "totalGroups",
        coalesce((select jsonb_object_agg(key_shape, target_rows) from dormant_reminders), '{}'::jsonb) as "dormantFailedReminderKeyRows",
        coalesce((select jsonb_agg(to_jsonb(visible)) from (
          select * from grouped order by guard, relation, state, kind, age, "queueEvidence" limit ${maxGroups}
        ) visible), '[]'::jsonb) as groups
    `, [actionKinds, Object.values(JOB_NAMES)])).rows;
    const cohortMatches = result.observedRows === scope.legacyRows && result.observedAccounts === scope.legacyAccounts;
    const complete = cohortMatches && result.linkedWorkRows === result.diagnosedRows && result.totalGroups <= maxGroups;
    await client.query("COMMIT");
    return { ...result, complete, outcome: complete ? "diagnostic_complete" : "diagnostic_scope_unverified" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
