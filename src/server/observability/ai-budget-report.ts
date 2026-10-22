import type { PoolClient } from "pg";

const STALE_COMMITMENT_SECONDS = 120;
type GlobalState = { windowDay: string; settledMicrodollars: string; settledCalls: string; outstandingMicrodollars: string; outstandingCalls: string; halted: boolean; updatedAt: string };
type Commitments = { reserved: number; submitting: number; uncertain: number; stale: number; oldestSeconds: number | null; reservedMicrodollars: string; unresolvedCalls: string };
type Settlements = { settled: number; actualMicrodollars: string };
type Violations = { boundViolations: number; actualOverReserved: number };
type Version = { priceVersion: string; policyVersion: string; attempts: number };

/** Caller owns the existing read-only snapshot. Never loads config, mutates or migrates. */
export async function readAiBudgetReport(client: Pick<PoolClient, "query">, since: Date, now: Date) {
  const availability = await client.query<{ states: boolean; attempts: boolean; boundViolation: boolean }>(`select
    to_regclass('public.ai_budget_states') is not null as states,
    to_regclass('public.ai_budget_attempts') is not null as attempts,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='ai_budget_attempts' and column_name='bound_violation') as "boundViolation"`);
  const observed = availability.rows[0];
  const tables = { states: Boolean(observed?.states), attempts: Boolean(observed?.attempts), boundViolation: Boolean(observed?.boundViolation) };
  const available = tables.states && tables.attempts && tables.boundViolation;
  let global: GlobalState | null = null;
  let commitmentsAllTime: Commitments | null = null;
  let settlementsInWindow: Settlements | null = null;
  let violationsAllTime: Violations | null = null;
  let versions: Version[] = [];
  let versionsTruncated = false;
  const problems = ["ai_budget_enforcement_unverified", "ai_budget_headroom_unknown"];
  const nextActions = ["Verify budget mode, approved caps and pricing/policy versions for every AI-producing web/worker deployment; current worker attestations do not prove budget enforcement."];
  if (!available) {
    problems.push("ai_budget_schema_unavailable");
    nextActions.push("Review the accounting migration/schema with the deployment owner; this report does not migrate or enable metering.");
  } else {
    const state = await client.query<GlobalState>(`select window_day::text as "windowDay",settled_microdollars::text as "settledMicrodollars",settled_calls::text as "settledCalls",
      outstanding_microdollars::text as "outstandingMicrodollars",outstanding_calls::text as "outstandingCalls",halted,
      to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from public.ai_budget_states where scope_key='global' limit 1`);
    global = state.rows[0] ?? null;
    const unresolved = await client.query<Commitments>(`select count(*) filter(where state='reserved')::int as reserved,
      count(*) filter(where state='submitting')::int as submitting,count(*) filter(where state='uncertain')::int as uncertain,
      count(*) filter(where created_at < $2)::int as stale,
      case when count(*)=0 then null else greatest(0,extract(epoch from ($1::timestamptz-min(created_at)))::int) end as "oldestSeconds",
      coalesce(sum(reserved_microdollars),0)::text as "reservedMicrodollars",count(*)::text as "unresolvedCalls"
      from public.ai_budget_attempts where state in ('reserved','submitting','uncertain')`, [now, new Date(now.getTime() - STALE_COMMITMENT_SECONDS * 1_000)]);
    commitmentsAllTime = unresolved.rows[0];
    const settled = await client.query<Settlements>(`select count(*)::int as settled,coalesce(sum(actual_microdollars),0)::text as "actualMicrodollars"
      from public.ai_budget_attempts where state='settled' and updated_at >= $1 and updated_at <= $2`, [since, now]);
    settlementsInWindow = settled.rows[0];
    const violations = await client.query<Violations>(`select count(*) filter(where bound_violation)::int as "boundViolations",
      count(*) filter(where actual_microdollars > reserved_microdollars)::int as "actualOverReserved" from public.ai_budget_attempts`);
    violationsAllTime = violations.rows[0];
    const versionRows = await client.query<Version>(`select
      case when price_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$' then price_version else 'invalid' end as "priceVersion",
      case when policy_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$' then policy_version else 'invalid' end as "policyVersion",count(*)::int as attempts
      from public.ai_budget_attempts group by 1,2 order by 1,2 limit 33`);
    versions = versionRows.rows.slice(0, 32); versionsTruncated = versionRows.rows.length > 32;
    if (!global) { problems.push("ai_budget_global_state_missing"); nextActions.push("Verify accounting initialization and deployment mode; absent global state cannot establish any spend allowance."); }
    if (global?.halted || violationsAllTime.boundViolations > 0 || violationsAllTime.actualOverReserved > 0) {
      problems.push("ai_budget_admission_review_required");
      nextActions.push("Review persisted envelope violations and authoritative provider usage before approving further paid admission; preserve outstanding commitments.");
    }
    if (commitmentsAllTime.uncertain > 0) { problems.push("ai_budget_uncertain_usage_requires_reconciliation"); nextActions.push("Independently reconcile uncertain usage against provider records; never refund on timeout, restart or UTC rollover."); }
    if (commitmentsAllTime.stale > 0) { problems.push("ai_budget_commitments_stale"); nextActions.push("Inspect stale reserved/submitting/uncertain attempts with the accounting owner; do not resend or release commitments based on age alone."); }
    if (global && global.windowDay !== now.toISOString().slice(0, 10)) { problems.push("ai_budget_window_stale"); nextActions.push("Global settled counters reflect another UTC admission day; authoritative outstanding commitments still apply across days."); }
    if (global && (global.outstandingMicrodollars !== commitmentsAllTime.reservedMicrodollars || global.outstandingCalls !== commitmentsAllTime.unresolvedCalls)) {
      problems.push("ai_budget_ledger_mismatch"); nextActions.push("Stop paid rollout and reconcile the global counters against unresolved attempts; this read-only report cannot repair accounting.");
    }
  }
  return {
    available, tables, units: "USD microdollars (1 USD = 1000000); money and call totals use integer strings",
    enforcementVerified: false as const,
    enforcementExplanation: "Current attestations do not prove budget mode, policy or pricing across all AI-producing processes.",
    headroomMicrodollars: null, headroomExplanation: "Approved monetary/call caps and deployment-wide policy configuration are not attested; headroom cannot be inferred from spend alone.",
    global, commitmentsAllTime, staleCommitmentSeconds: STALE_COMMITMENT_SECONDS, settlementsInWindow,
    settlementWindowBasis: "Authoritative settlement updated_at; charges remain attributed to each attempt's original admission day.",
    violationsAllTime, versions, versionsTruncated, problems, nextActions,
  };
}
