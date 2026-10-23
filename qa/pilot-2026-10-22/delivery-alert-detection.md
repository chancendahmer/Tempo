# Local delivery-failure detection

2026-10-22. Bounded improvement after inspecting PILOT_HANDOFF, PILOT_PLAN, OPERATIONS, and the existing read-only operations report. Hosted alert delivery and rollback remain release gates; this package does not duplicate backup/queue drills.

## Gap and change

The report already counted failed/undelivered outbound messages, but these counts did not contribute a problem code or a recovery action. This left delivery failures without their own machine-readable review signal, despite the runbook requiring investigation of failed/held deliveries.

`src/server/observability/pilot-operations-report.ts` now adds `delivery_failures_require_review` when `recentMessages.deliveryFailures > 0`, plus a fixed action: review the selected creation-time window's failed/undelivered outbound records with secure account-scoped provider receipts; never bulk replay or reset uncertain submissions. No SQL, report window, private field projection, mutation, retry, or provider behavior changed. Existing CLI handling of report problems remains unchanged. Independent AI rollout/unknown-inventory problems remain intact; the report already has those gates and this change does not make a no-delivery-failures report universally green.

## Evidence

The new unit regression was run before the production change: five tests passed and the new sixth test failed because no delivery-specific signal was present. After the two-line production change, both nearest files passed all seven tests. Raw `npm run lint`, `npm run typecheck`, and scoped `git diff --check` passed.

The unit comparison checks zero versus two failed deliveries, verifies the new problem/action are the only additions, and retains independent budget-enforcement uncertainty. The existing disposable PGlite integration now exercises real report SQL with failed and undelivered outbound records, a failed inbound record, a delivered outbound record, older/out-of-window and future records. Only the two current outbound failures contribute to the original window; a later one-hour window includes only its matching fixture. The report contains no seeded message body, provider diagnostic, or conversation identifier. Controlled fixture-only status changes verify that absent failures do not leave a stale detector result; this is not an operator repair procedure.

Independent review requested from w2 and queued behind its active task-duration correctness fix. Parent owns integrated release validation and any checkpoint.

## Operating limits

This is local detection and receipt-first recovery guidance. It sends no email/SMS/webhook, configures no monitor, names no on-call recipient, and proves no hosted alert delivery. The report's existing selected window is based on message creation time, not a newly received delivery-status timestamp; older records outside that window are not covered by this detector. Operators must choose a relevant bounded report window and investigate securely rather than modifying ledger statuses to make alerts disappear. No populated environment file, hosted service, paid provider, or deployment was accessed.
