# November 11 hosted continuation

## Released guide and context work

PR #29 merged as `943d560fcb6219b43ced8d6d37488c29656ea7b4`.
The release passed `npm run check`: 179 files, 1,430 tests, no skipped tests,
lint, typecheck, Next production build and operations build. The PostgreSQL
test suites used isolated local fixtures, not production load tests.

Both production services deployed that commit with optional outreach disabled.
The lead then completed all seven tutorial steps in the authenticated demo
account. Highlights followed the controls; Done restored Settings and focus to
Show me around. Quiet hours and opt-in survived the deployment and reload.

The founder restored the dedicated demo TextFree session. The only new account
record is the task **Tempo QA Nov 11: outline the demo handoff**, due November 11
at 4:30 PM New York, estimated ten minutes. Its removal remains part of test
cleanup. No personal records or old demo tasks were changed.

## Dedicated demo canary

The lead set the same single dedicated demo account in
`PROACTIVE_CANARY_USER_IDS` on web and worker. Shadow mode remains on and the
global autonomous/cleanup flags remain off. Canary permission enables both
coaching and cleanup for that account, subject to all normal consent, quiet-hour,
Calendar, focus, cooldown, holdout, contact and budget gates. Other accounts have
not been granted delivery permission by this configuration change.

Active same-code canary deployments observed:

- Web: `e55c5ae8-bdc6-4638-9bc3-13f5e65b8171`.
- Worker: `7e0a21e2-bb0f-423a-ac24-b548816a1470`.

Railway showed the preceding web `11eec250-3111-4c81-a486-925ebd6c2ccf` and
worker `48e1b6e9-1441-49c7-a706-98d5615478ae` as Removed. An exact two-key
manifest archived their stale heartbeat evidence through the audited retirement
API; it did not delete customer or outbound records. SHA-256:
`4ac66128d579d07ab14f317bc9033be2fdb0d53407914f757a76b6f8dcfff593`.
Read-only recheck returned `alreadyRecorded: true`. Same-build retirement used
exact stopped instance keys, not selection by build alone.

Readiness then reported one fresh matching worker, zero stale/unknown workers,
known policy, canary count one, no problems, and no pending outbound uncertainty.
All 35 acknowledged historical outbound records remain intact.

Live Settings displays **Timing checks are active**, with saved quiet hours
23:00–07:00 America/New_York and Google Calendar connected. The account has its
existing one-contact-per-day limit. No new consent was created.

At 20:49 UTC the normal evaluator chose randomized holdout. At 21:04:59 UTC a
real model review of the old top-ranked task vetoed outreach (`ai_review_skip`).
The corresponding message query showed no new outbound message. This proves
review/veto operation, **not successful automatic SMS delivery**.

Private browser captures are under `private/`, excluded from Git. They include
the live tutorial, Settings, and Railway deployment inventory. Do not publish
captures of account contents or sign-in messages.

## Follow-up ranking repair

Branch `codex/current-task-priority`, based on the merged release:

- `7547923`: urgency peaks at a deadline and decays in both directions, so
  month-old tasks no longer monopolize reviews. A fresh linked Thought can
  restore bounded relevance. Existing gates and opportunity keys remain.
- `b4e93c1`: Home's banner and collapsed rows share one account-local ordering:
  current focus, started, today, most recently overdue, undated, future.

The exact four-task backlog was reproduced before the fix. Independent local
review ran 109 focused tests and approved the under-limit case, but found that
the server's old ordering before a 200-row limit could still exclude today's
work. That server repair and final release validation are pending. Do not call
these two commits the deployed build yet.

## Spending

Previous conservative run commitments remain $16.902717 against the approved
$20 testing cap; retain the historical unresolved and hosted/carrier holds.
Previously confirmed test usage was $4.449248. This continuation observed:

| Operation | UTC timestamp | Settled USD |
| --- | --- | ---: |
| Automatic task presentation | Nov 11 20:27:18 | 0.004446 |
| Automatic intervention review, veto | Nov 11 21:04:59 | 0.005340 |

New confirmed subtotal so far: $0.009786; cumulative known test usage:
**$4.459034**. No unresolved historical charge was treated as free. The separate
ongoing enforced pilot allowance remains **$10 total per UTC day** across
accounts. Query the ledger again before declaring final totals, since normal
demo-canary evaluations can continue.

## Remaining verification

1. Finish and independently review bounded server ordering, run final checks,
   and release only a reviewed passing candidate.
2. Observe the normal evaluator after that deployment. Record actual recipient
   arrival separately from provider acceptance and database state; do not force
   a send by bypassing gates or resetting contacts/holdouts.
3. Remove only the task created for this run, then record the final ledger and
   healthy matching web/worker versions.
4. See CHECKPOINT.md for advertised gaps: task-led proactive coverage, separate
   web/SMS onboarding, hardware/wearables, Calendar scope, billing, hosted cohort
   evidence, backups/alerts and forthcoming Railway configuration migration.
