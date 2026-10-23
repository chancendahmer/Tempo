import { expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { pilotReportHours, readPilotOperationsReport } from "./pilot-operations-report";
import { createWorkerAttestation } from "./worker-attestation";
const now = new Date("2026-10-22T12:00:00Z"), build = "abcdef1234567";
const env = { TEMPO_BUILD_SHA: build, RAILWAY_GIT_COMMIT_SHA: undefined, INTERVENTION_SHADOW_MODE: true, AUTONOMOUS_SENDING_ENABLED: false, CLEANUP_CHECKINS_ENABLED: false, PROACTIVE_CANARY_USER_IDS: [] };
const queue = { blockedAccounts: 0, ambiguousOutbound: 0, pendingInbound: 0, oldestPendingSeconds: null };
function fixture(queuePresent = true, stale = false, deliveryFailures = 1) {
  const query = vi.fn(async (text: string) => {
    if (text.includes("from service_heartbeats")) return { rows: [{ serviceKey: "tempo-worker:private-id", lastSeenAt: now, metadata: { ...createWorkerAttestation(env, queue), phone: "+12025550199", token: "private-token" } },
      ...(stale ? [{ serviceKey: "tempo-worker:old-instance", lastSeenAt: new Date(now.getTime() - 121_000), metadata: createWorkerAttestation(env, queue) }] : [])] };
    if (text.includes("from users")) return { rows: [{ total: 10, verified: 8, onboardingComplete: 6, optedOut: 1, paused: 1, proactiveOptIn: 2 }] };
    if (text.includes("created_at >=")) return { rows: [{ inbound: 20, outbound: 18, deliveryFailures, delivered: 18 - deliveryFailures }] };
    if (text.includes("from conversation_messages")) return { rows: [{ pendingInbound: 1, oldestPendingSeconds: 700, uncertainOutbound: 1 }] };
    if (text.includes("jsonb_array_length")) return { rows: [{ audits: 2 }] };
    if (text.includes("from scheduled_actions")) return { rows: [{ kind: "process_inbound_message", state: "failed", count: 1, oldestDueSeconds: 700 }] };
    if (text.includes("to_regclass")) return { rows: [{ present: queuePresent }] };
    if (text.includes("from pgboss.job")) return { rows: [{ queue: "tempo.process-inbound", state: "failed", count: 1, oldestSeconds: 700 }] };
    return { rows: [] };
  });
  return { query, client: { query } as unknown as Pick<PoolClient, "query"> };
}
it("bounds the report window and rejects authority/SQL options", () => {
  expect(pilotReportHours([])).toBe(24);
  expect(pilotReportHours(["--hours", "168"])).toBe(168);
  for (const args of [["--hours", "169"], ["--hours", "0"], ["--hours", "1.5"], ["--sql", "select 1"], ["--hours", "1", "--apply"]]) expect(() => pilotReportHours(args)).toThrow();
});
it("reads one bounded read-only snapshot and reports recovery causes without raw private fields", async () => {
  const { query, client } = fixture();
  const report = await readPilotOperationsReport(client, { hours: 24, webBuild: build, now });
  expect(query.mock.calls[0][0]).toBe("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  expect(query.mock.calls[1][0]).toBe("SET LOCAL statement_timeout = '5s'");
  expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  expect(report.problems).toEqual(expect.arrayContaining(["outbound_reconciliation_required", "inbound_backlog_stale", "failed_jobs_require_review", "failed_actions_require_review"]));
  expect(report.worker).toMatchObject({ ok: true, allCoachingDisabled: true });
  expect(report.aiBudget).toMatchObject({ available: false, enforcementVerified: false, headroomMicrodollars: null });
  expect(report.problems).toContain("ai_budget_schema_unavailable");
  for (const value of ["private-id", "private-token", "+12025550199"]) expect(JSON.stringify(report)).not.toContain(value);
  const sql = query.mock.calls.map(call => call[0]).join("\n");
  expect(sql).not.toMatch(/\b(insert|update|delete|create|alter|drop)\b/i);
  expect(sql).not.toMatch(/phone_e164|body|last_error|provider_error|access_token|refresh_token/i);
  expect(sql).not.toContain("from public.ai_budget_attempts");
});
it("reports an uninitialized queue without starting pg-boss or attempting migrations", async () => {
  const { query, client } = fixture(false);
  const report = await readPilotOperationsReport(client, { hours: 1, webBuild: build, now });
  expect(report.problems).toContain("queue_table_unavailable");
  expect(query.mock.calls.some(call => call[0].includes("from pgboss.job"))).toBe(false);
});
it("requests inventory/retirement review even if fresh runtime readiness remains healthy", async () => {
  const { client } = fixture(true, true);
  const report = await readPilotOperationsReport(client, { hours: 24, webBuild: build, now });
  expect(report.worker).toMatchObject({ ok: true, policyKnown: false, allCoachingDisabled: false });
  expect(report.problems).toContain("stale_worker_policy_unknown");
  expect(report.nextActions.some(action => action.includes("unretired instance records"))).toBe(true);
});
it("raises an explicit delivery-failure signal and receipt-first recovery action without changing independent rollout gates", async () => {
  const before = await readPilotOperationsReport(fixture(true, false, 0).client, { hours: 24, webBuild: build, now });
  const failed = await readPilotOperationsReport(fixture(true, false, 2).client, { hours: 24, webBuild: build, now });
  expect(before.problems).not.toContain("delivery_failures_require_review");
  expect(failed.problems.filter(problem => !before.problems.includes(problem))).toEqual(["delivery_failures_require_review"]);
  expect(failed.problems).toEqual(expect.arrayContaining(before.problems));
  expect(failed.nextActions.filter(action => !before.nextActions.includes(action))).toEqual([
    "Review failed/undelivered outbound messages from the selected creation-time window using secure account-scoped provider receipts; never bulk replay or reset uncertain submissions.",
  ]);
  expect(failed.recentMessages.deliveryFailures).toBe(2);
  expect(failed.aiBudget.enforcementVerified).toBe(false);
});
it("rolls back on a failed/timeout read and never emits a partial success", async () => {
  const { query, client } = fixture();
  query.mockRejectedValueOnce(Object.assign(new Error("Statement timed out"), { code: "57014" }));
  await expect(readPilotOperationsReport(client, { hours: 24, webBuild: build, now })).rejects.toThrow("Statement timed out");
  // BEGIN itself failed: no transaction existed and no SQL beyond it is issued.
  expect(query).toHaveBeenCalledTimes(1);
  const second = fixture();
  second.query.mockImplementationOnce(async () => ({ rows: [] })).mockRejectedValueOnce(new Error("Read failed"));
  await expect(readPilotOperationsReport(second.client, { hours: 24, webBuild: build, now })).rejects.toThrow("Read failed");
  expect(second.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});
