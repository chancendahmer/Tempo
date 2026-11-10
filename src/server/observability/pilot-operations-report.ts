import type { PoolClient } from "pg";
import { JOB_NAMES } from "../jobs/names";
import { summarizeWorkerAttestations, type WorkerHeartbeat } from "./worker-attestation";
import { readAiBudgetReport } from "./ai-budget-report";
import { MAX_AI_ATTESTATION_ROWS, summarizeAiBudgetAttestations } from "./ai-budget-attestation";
import { MAX_REPORTED_RECEIPT_DROPS_PER_MINUTE } from "../db/repositories/delivery-receipts";
import { dispositionSchemaAvailable, outboundAcknowledgedSql } from "../db/repositories/outbound-dispositions";

const jobNames = [...Object.values(JOB_NAMES), "tempo.task-presentation"];
const actionKinds = ["send_signin", "send_welcome", "send_compliance", "process_inbound_message", "deliver_reminder", "sync_calendar", "evaluate_context", "deliver_intervention", "accountability_followup", "feedback_followup", "feedback_timeout"];
export function pilotReportHours(args: string[]) {
  if (!args.length) return 24;
  if (args.length !== 2 || args[0] !== "--hours" || !/^\d+$/.test(args[1]) || Number(args[1]) < 1 || Number(args[1]) > 168) throw new Error("Use --hours with an integer from 1 to 168");
  return Number(args[1]);
}

/** No queue client, migrations or mutations. Every read shares one bounded snapshot. */
export async function readPilotOperationsReport(client: Pick<PoolClient, "query">, options: { hours: number; webBuild: string | null; now?: Date }) {
  const hours = pilotReportHours(["--hours", String(options.hours)]);
  const now = options.now ?? new Date(), since = new Date(now.getTime() - hours * 3_600_000);
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    const heartbeats = await client.query<WorkerHeartbeat>(`select service_key as "serviceKey", last_seen_at as "lastSeenAt", metadata
      from service_heartbeats where (service_key = 'tempo-worker' or service_key like 'tempo-worker:%')
      order by last_seen_at desc limit 22`);
    const worker = summarizeWorkerAttestations(heartbeats.rows, options.webBuild, now);
    const accounts = await client.query<{ total: number; verified: number; onboardingComplete: number; optedOut: number; paused: number; proactiveOptIn: number }>(`select
      count(*)::int as total, count(*) filter (where phone_verified_at is not null)::int as verified,
      count(*) filter (where onboarding_state='complete')::int as "onboardingComplete",
      count(*) filter (where status='opted_out')::int as "optedOut",
      count(*) filter (where status='paused' or paused_until > $1)::int as paused,
      count(*) filter (where proactive_opt_in)::int as "proactiveOptIn" from users where status <> 'deleted'`, [now]);
    const messages = await client.query<{ inbound: number; outbound: number; deliveryFailures: number; delivered: number }>(`select
      count(*) filter (where direction='inbound')::int as inbound,
      count(*) filter (where direction='outbound')::int as outbound,
      count(*) filter (where direction='outbound' and status in ('failed','undelivered'))::int as "deliveryFailures",
      count(*) filter (where direction='outbound' and status='delivered')::int as delivered
      from conversation_messages where created_at >= $1 and created_at <= $2`, [since, now]);
    const held = await client.query<{ pendingInbound: number; oldestPendingSeconds: number | null; uncertainOutbound: number }>(`select
      count(*) filter (where direction='inbound' and status in ('received','processing'))::int as "pendingInbound",
      greatest(0, extract(epoch from ($1::timestamptz - min(created_at) filter (where direction='inbound' and status in ('received','processing'))))::int) as "oldestPendingSeconds",
      count(*) filter (where direction='outbound' and (outbound_state='ambiguous' or (outbound_state='submitting' and submission_started_at < $2)))::int as "uncertainOutbound"
      from conversation_messages`, [now, new Date(now.getTime() - 120_000)]);
    const dispositionAvailable = await dispositionSchemaAvailable(client);
    const acknowledgedHistoricalOutbound = dispositionAvailable
      ? (await client.query<{ acknowledgedHistoricalOutbound: number }>(outboundAcknowledgedSql)).rows[0].acknowledgedHistoricalOutbound : 0;
    const heldWork = { ...held.rows[0], acknowledgedHistoricalOutbound,
      pendingOutbound: held.rows[0].uncertainOutbound - acknowledgedHistoricalOutbound };
    const [inboxSchema] = (await client.query<{ present: boolean }>("select to_regclass('public.pending_delivery_receipts') is not null as present")).rows;
    const inboxSize = inboxSchema.present ? (await client.query<{ active: number }>(
      "select count(*)::int as active from pending_delivery_receipts where expires_at > $1", [now])).rows[0].active : null;
    const dropWindowStart = new Date(Math.max(since.getTime(), now.getTime() - 24 * 3_600_000));
    const [receiptDrops] = (await client.query<{ count: number; capped: boolean }>(`select coalesce(sum(count), 0)::int as count,
      coalesce(bool_or(count >= $4), false) as capped from rate_limit_buckets where key = any($3::text[])
      and window_start >= $1 and window_start <= $2`, [dropWindowStart, now,
      ["pending-delivery-drop:linq", "pending-delivery-drop:sendblue", "pending-delivery-drop:twilio"], MAX_REPORTED_RECEIPT_DROPS_PER_MINUTE])).rows;
    const deliveryReceiptInbox = { available: inboxSchema.present, active: inboxSize, quotaDrops: receiptDrops.count,
      quotaDropCounterCapped: receiptDrops.capped, dropWindowHours: Math.min(hours, 24) };
    const actions = await client.query<{ kind: string; state: string; count: number; oldestDueSeconds: number }>(`select
      case when kind=any($1::text[]) then kind else 'other' end as kind, status::text as state,
      count(*)::int as count, greatest(0, extract(epoch from ($2::timestamptz - min(run_at)))::int) as "oldestDueSeconds"
      from scheduled_actions where status in ('scheduled','running','failed') and run_at <= $2
      group by 1,2 order by 1,2 limit 48`, [actionKinds, now]);
    const recovery = await client.query<{ audits: number }>(`select coalesce(sum(jsonb_array_length(case when jsonb_typeof(payload->'recoveryAudit')='array' then payload->'recoveryAudit' else '[]'::jsonb end)),0)::int as audits from scheduled_actions`);
    const queueExists = await client.query<{ present: boolean }>("select to_regclass('pgboss.job') is not null as present");
    let jobs: Array<{ queue: string; state: string; count: number; oldestSeconds: number }> = [];
    if (queueExists.rows[0]?.present) {
      const result = await client.query<{ queue: string; state: string; count: number; oldestSeconds: number }>(`select
        case when name=any($1::text[]) then name else 'other' end as queue, state::text as state, count(*)::int as count,
        greatest(0, extract(epoch from ($2::timestamptz - min(created_on)))::int) as "oldestSeconds"
        from pgboss.job where state in ('created','retry','active','failed') group by 1,2 order by 1,2 limit 56`, [jobNames, now]);
      jobs = result.rows;
    }
    const aiInstances = await client.query<WorkerHeartbeat>(`select service_key as "serviceKey",last_seen_at as "lastSeenAt",metadata
      from service_heartbeats where service_key='tempo-worker' or service_key like 'tempo-worker:%' or service_key like 'tempo-web:%'
      order by last_seen_at desc limit $1`, [MAX_AI_ATTESTATION_ROWS]);
    const aiConfiguration = summarizeAiBudgetAttestations(aiInstances.rows, options.webBuild, now);
    const aiBudget = await readAiBudgetReport(client, since, now, aiConfiguration);
    const problems = [...worker.problems, ...worker.queueProblems, ...aiBudget.problems,
      ...(!queueExists.rows[0]?.present ? ["queue_table_unavailable"] : []),
      ...(messages.rows[0].deliveryFailures > 0 ? ["delivery_failures_require_review"] : []),
      ...(!deliveryReceiptInbox.available ? ["delivery_receipt_inbox_unavailable"] : []),
      ...(deliveryReceiptInbox.quotaDrops > 0 ? ["delivery_receipt_inbox_overflow"] : []),
      ...(heldWork.pendingOutbound > 0 ? ["outbound_reconciliation_required"] : []),
      ...((held.rows[0].oldestPendingSeconds ?? 0) > 660 ? ["inbound_backlog_stale"] : []),
      ...(jobs.some(row => row.state === "failed") ? ["failed_jobs_require_review"] : []),
      ...(actions.rows.some(row => row.state === "failed") ? ["failed_actions_require_review"] : []),
    ];
    const report = { generatedAt: now.toISOString(), windowHours: hours, worker, aiBudget,
      accounts: accounts.rows[0], recentMessages: messages.rows[0], heldWorkAllTime: heldWork,
      outboundDispositionsAvailable: dispositionAvailable,
      deliveryReceiptInbox,
      dueActionsAllTime: actions.rows, queueAvailable: Boolean(queueExists.rows[0]?.present), queuedJobsAllTime: jobs,
      recoveryAuditsAllTime: recovery.rows[0]?.audits ?? 0, problems: [...new Set(problems)],
      nextActions: [
        ...aiBudget.nextActions,
        ...(!worker.ok || !worker.policyKnown ? ["Verify all worker deployments, build stamps and unretired instance records; web liveness cannot prove worker configuration or termination."] : []),
        ...(messages.rows[0].deliveryFailures > 0 ? ["Review failed/undelivered outbound messages from the selected creation-time window using secure account-scoped provider receipts; never bulk replay or reset uncertain submissions."] : []),
        ...(deliveryReceiptInbox.quotaDrops > 0 ? ["Investigate authenticated delivery callback volume and compare provider receipts for affected sends before taking recovery action."] : []),
        ...(heldWork.pendingOutbound > 0 ? ["Compare provider receipts before reconciling uncertain sends; never blindly resend or reset the ledger."] : []),
        ...(jobs.some(row => row.state === "failed") ? ["Inspect failed jobs securely; use recover-inbound dry run for one verified account/job after confirming provider state."] : []),
        ...(worker.policy.cleanupPermission || worker.policy.proactivePermission ? ["Confirm coaching release is intentional; see the runbook to stop workers and disable cleanup/canary/global permissions."] : []),
      ],
    };
    await client.query("COMMIT");
    return report;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
