import type { PoolClient } from "pg";
import { expect, it, vi } from "vitest";
import { readAiBudgetReport } from "./ai-budget-report";

const now = new Date("2026-10-22T12:00:00Z");
function fixture(globalPresent: boolean) {
  const query = vi.fn(async (text: string) => {
    if (text.includes("to_regclass")) return { rows: [{ states: true, attempts: true, boundViolation: true }] };
    if (text.includes("from public.ai_budget_states")) return { rows: globalPresent ? [{ windowDay: "2026-10-22", settledMicrodollars: "0", settledCalls: "0", outstandingMicrodollars: "1", outstandingCalls: "1", halted: false, updatedAt: now.toISOString() }] : [] };
    if (text.includes("as reserved")) return { rows: [{ reserved: 0, submitting: 0, uncertain: 0, stale: 0, oldestSeconds: null, reservedMicrodollars: "0", unresolvedCalls: "0" }] };
    if (text.includes("as settled")) return { rows: [{ settled: 0, actualMicrodollars: "0" }] };
    if (text.includes("as \"boundViolations\"")) return { rows: [{ boundViolations: 0, actualOverReserved: 0 }] };
    return { rows: [] };
  });
  return { query } as unknown as Pick<PoolClient, "query">;
}
it("reports absent global initialization without inventing spend or headroom", async () => {
  const report = await readAiBudgetReport(fixture(false), now, now);
  expect(report).toMatchObject({ available: true, global: null, enforcementVerified: false, headroomMicrodollars: null, commitmentsAllTime: { oldestSeconds: null } });
  expect(report.problems).toContain("ai_budget_global_state_missing");
  expect(report.nextActions.some(action => action.includes("absent global state"))).toBe(true);
});
it("flags counter disagreement and keeps paid rollout review actionable", async () => {
  const report = await readAiBudgetReport(fixture(true), now, now);
  expect(report.problems).toContain("ai_budget_ledger_mismatch");
  expect(report.nextActions.some(action => action.includes("reconcile the global counters"))).toBe(true);
  expect(report.enforcementVerified).toBe(false);
});
