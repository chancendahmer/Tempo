Tempo can now explain and guide actual account controls, and optional coaching
uses saved workspace context before deciding whether a task nudge is useful.
The tour highlights real buttons with the mascot, preserves setup drafts, and
supports skip/replay, keyboard focus and compact screens. Settings distinguish
saved opt-in from available delivery and allow durable overnight quiet hours.

The check-in pipeline now respects persisted and text-started focus sessions,
routine timing, recent activity and linked Thoughts. Reviews are reserved once,
AI errors/incomplete responses veto, and both coaching and stale-item reviews
revalidate account and target state immediately before provider submission.
Retry handling preserves uncertain sends and avoids stale composed prompts.
Public pilot, pricing and integration claims are qualified to current behavior.

Validation: focused independent tests and local authenticated/preview browser
journeys passed. The first full check passed 1,417 tests across 179 files,
lint, typecheck and production build with real local PostgreSQL suites enabled.
The final full check is rerunning after the cleanup delivery fix. Hosted canary
verification is still required before proactive rollout. No schema migration.

Evidence, review limits, remaining product gaps and rollback:
[checkpoint](qa/pilot-2026-11-11/CHECKPOINT.md),
[independent customer audit](qa/pilot-2026-11-11/customer-capability-audit.md).
