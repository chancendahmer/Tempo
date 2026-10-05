export type QueueHealth = { blockedAccounts: number; ambiguousOutbound: number; pendingInbound: number; oldestPendingSeconds: number | null };
export function queueHealthProblems(health: QueueHealth): string[] {
  return [
    ...(health.blockedAccounts > 0 ? ["blocked_accounts"] : []),
    ...(health.ambiguousOutbound > 0 ? ["outbound_reconciliation_required"] : []),
    ...((health.oldestPendingSeconds ?? 0) > 660 ? ["inbound_backlog_stale"] : []),
  ];
}
