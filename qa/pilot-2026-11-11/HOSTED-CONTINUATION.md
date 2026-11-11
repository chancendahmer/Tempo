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

At 20:49 UTC the normal evaluator chose randomized holdout. The 21:04:59 UTC
model response failed strict validation and correctly failed closed
(`ai_review_invalid_fail_closed`). This was not a valid semantic model veto.
At 21:15:03 UTC a second real review returned a valid veto: the old task was
several weeks overdue with insufficient current context. No new outbound
message appeared in the ledger or recipient inbox. These are separate evidence
of invalid-response containment and a semantic veto, **not successful automatic
SMS delivery**.

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

The exact four-task backlog was reproduced before the fix. Independent review
found that the server's old ordering before a 200-row limit could exclude today's
work. Commit `1958d22` applies ordering before that limit. Commit `bab6032`
canonicalizes Intl timezone aliases and handles numeric offsets through the
PostgreSQL interval overload, preserving the saved profile timezone. Commit
`34f5533` corrects rundown bounds around skipped and repeated local midnights.

The complete `npm run check` passed on `b6a394d`: **179 files / 1,450 tests**,
lint, typecheck, Next.js production build and operations build, exit 0. Both
isolated PostgreSQL integration and recovery test databases were enabled.
Evidence: `priority-final-check.log`. Interrupted checks are not counted as passes.
A subsequent independent audit found a preview-only simulated-clock mismatch
for timer labels. Commit `f1a71d0` fixes it. The new full check passed with
**179 files / 1,451 tests**, lint, typecheck and production/operations builds,
exit 0, with both isolated PostgreSQL suites enabled. Evidence:
`priority-release-final.log`. The lead separately verified an active countdown
stays running when the sample clock jumps ahead to 9:30 PM.

Fresh independent browser review scored **Home 9/10 and guide 9/10** at desktop
and 390 × 844 on the real clock. Task creation feedback, timer ownership,
pause/resume/expiry, toast placement and all eight preview tour steps passed.
See `final-customer-review.md`. Two minor mobile findings remain: an absent
wordmark referenced by one tour instruction and a narrow wrapping View To-do
label. These scores cover those reviewed surfaces, not the entire product or SMS.

No schema migration is added. Rollback requires restoring both web and worker
to `943d560fcb6219b43ced8d6d37488c29656ea7b4`, preserving PostgreSQL. To contain
optional outreach, clear the demo canary on both roles and retain shadow mode
on, autonomous sending off and cleanup off. Do not remove outbound evidence.
PR #30 is the release candidate; record its merge and hosted verification below.

## PR 30 release

PR #30 merged November 11 at 21:51:49 UTC as
`38c5ab701a49618e152141ca3c9ddc6b84178ae7`. The reviewed candidate head was
`a6e6484`; its final code is `f1a71d0`, with subsequent evidence-only commits.
Web deployment `5772919b-f79a-447d-8b73-7aa5c80f193c` was explicitly triggered;
worker deployment `f0378937-869d-4f09-998c-bc150013b2c2` started automatically.
Both deployed successfully. Railway confirmed the former web `e55c5ae8` and
worker `7e0a21e2` Removed. The guarded CLI prepared, dry-ran and applied the
exact two-record heartbeat archive, SHA-256
`c84550516e4991cde63cd3e3be697d320ba70f1a00e07a4d032e76d06539272e`.
Subsequent readiness was HTTP 200 with the matching 38c5ab7 worker, one fresh
instance, zero stale/unknown instances, known demo-only policy, no problems,
and zero pending outbound uncertainty. Historical acknowledged records remain.

Authenticated production Home survived reload and displayed the new same-day
task first, ahead of October backlog. Calendar refreshed from the connected
Google primary calendar with zero events and the saved task in its day agenda.
Private captures: `production-current-task-priority.png`,
`railway-pr30-web-active.png`, `railway-pr30-worker-active.png`.

At 21:55:17 UTC the new worker selected the correct fresh task (score 0.8291),
but a valid model veto rejected it as 25 minutes overdue. This demonstrates
ranking repair and a conservative veto, not delivery. The lead then rescheduled
only that fictional task to 5:20 PM New York through the Calendar task editor;
the visible saved agenda confirmed the new time. Its next normal opportunity
will distinguish a future-due review from the overdue case without bypassing
any gates. Cleanup remains pending until that observation is recorded.

## Spending

Previous conservative run commitments remain $16.902717 against the approved
$20 testing cap; retain the historical unresolved and hosted/carrier holds.
Previously confirmed test usage was $4.449248. This continuation observed:

| Operation | UTC timestamp | Settled USD |
| --- | --- | ---: |
| Automatic task presentation | Nov 11 20:27:18 | 0.004446 |
| Automatic review, invalid response contained | Nov 11 21:04:59 | 0.005340 |
| Automatic review, valid stale-task veto | Nov 11 21:15:03 | 0.004965 |

New confirmed subtotal so far: $0.014751; cumulative known test usage:
**$4.463999**. No unresolved historical charge was treated as free. The separate
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
