import { expect, it } from "vitest";
import { queueHealthProblems } from "./queue-health";
it("reports blocked and ambiguous work even when the worker heartbeat is fresh", () => {
  expect(queueHealthProblems({ blockedAccounts: 1, ambiguousOutbound: 2, pendingInbound: 3, oldestPendingSeconds: 661 }))
    .toEqual(["blocked_accounts", "outbound_reconciliation_required", "inbound_backlog_stale"]);
  expect(queueHealthProblems({ blockedAccounts: 0, ambiguousOutbound: 0, pendingInbound: 1, oldestPendingSeconds: 30 })).toEqual([]);
});
