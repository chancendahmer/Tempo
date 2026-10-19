# Calm UI release checkpoint — October 19, 2026

## Today, introduction and activity streak refinement

The October 19 Tiimo comparison pass adds a skippable account-backed setup,
optional real completion streak, durable routine history, clearer Today event
cards, the Tempo character, and completion recovery. Independent first-pass
usability was 7.5; named repairs brought the secondary evidence review to 8.2.
The second review used screenshots, parent interaction records and source
inspection because the reviewer's browser became unavailable. This is a scoped
UI score, not whole-product readiness or clinical evidence.

See the [verification and migration handoff](../qa/tiimo-refinement-2026-10-19/README.md)
and [research notes](../qa/tiimo-refinement-2026-10-19/RESEARCH.md).
Migrations 0029/0030 were applied only to the isolated QA database. Saved
preferences, routine checkoff/Undo/reload, and a fresh account's skippable setup
were exercised through the local authenticated development runtime. Compiled
preview rendering passed; its HTTP localhost launcher cannot validate production
authentication because production correctly requires a public HTTPS base URL.
Final `npm run check` passed: lint, typecheck, 834 tests passed / 3 skipped,
Next.js production build and operations build. API spend was $0. The live
integration and release gates below still apply.

## Latest navigation refinement

October 19: replaced the permanent rail with a closed-by-default drawer on all
screen sizes, added Today app shortcuts, simplified section symbols and
typography, and retained restrained active-section color. Keyboard focus,
mobile navigation, all grouped destinations and compiled layouts were checked.
`npm run check` passed with 810 tests; final lint/typecheck/build passed. This
pass spent $0 on APIs. See the [navigation verification record](../qa/ui-navigation-2026-10-19/README.md).
The earlier 8.7 score below applies to the previous visual pass; no new
whole-product readiness score or live provider verification is claimed here.
Production and the outstanding release gates are unchanged.

## Latest UI polish pass

The later October 18 pass refines the neutral sidebar, section navigation, Today
hierarchy, motion, mobile focus and conversation layout. Research used public
official planner, Muse and MyFitnessPal material, with access limits documented.
See the [polish verification record](../qa/ui-polish-2026-10-18/README.md) and
[independent visual review](../qa/ui-polish-2026-10-18/independent-review.md).
The scoped visual score is **8.7/10**, not a whole-product release score.
A fictional note was saved, reloaded and removed through the authenticated
isolated local account. This pass spent **$0** on APIs and did not change
production, provider routing, schemas or the remaining release gates below.

## Latest continuation

The October 18 continuation resumed the same candidate and original $10 API
budget. It did not merge or change production. See
[current acceptance record](../qa/customer-review-2026-10-18/README.md),
[mobile review](../qa/customer-review-2026-10-18/mobile-review.md), and
[deployment audit](UI_RELEASE_RESUME_AUDIT.md) before the historical record below.

Fresh evidence includes 19 authenticated HTTP acceptance groups, account-local
dated nutrition history, 20-account PostgreSQL concurrency/recovery tests, and
33 provider-free scripted assistant turns. Root used the real authenticated
candidate at a 390 × 844 browser viewport. A live Claude turn read the newly
saved 240 kcal / 8 g protein breakfast, saved an accurate note, and made it
visible in Thoughts. Food and the note survived re-login; both were subsequently
removed through the UI, along with the one new fictional workout. Existing
fixtures and all personal records were preserved.

Independent visual review identified unclear overdue dates, a hidden goal
achievement action, and deep fitness navigation. Those were corrected and
recaptured. Screenshot scores for the depicted local sections are 8–8.5;
Fitness's final 8 was assessed by root because its initial reviewer authored
the section reorder. These are local scoped scores, not a released journey
score or evidence of carrier/Google integration.

Wrong-number recovery was exercised through the actual form and local routes
using a contained Sendblue stub: pending signup → different number → cleared
fields/consent → replacement signup → back to sign-in. Separate HTTP assertions
proved trusted logout revokes the original claim, a foreign-origin logout is
rejected, and the original late sign-in token cannot replace the new account.
No START link was followed and no SMS was sent. A browser-rendered network/500
logout failure remains untested; the HTTP rejection and existing mocked UI
tests are distinct evidence.

Measured API spend is now **$5.547330**, conservatively committed **$5.730615**
including the retained unknown-outcome reserve. Conservative allowance remaining
under the original $10 cap: **$4.269385**. This continuation added **$0.189555**.
The ledger remains `qa/release-2026-10-15-live/cost.json` with its $7 local cap.

The current release blocker is a candidate-owned live integration environment
and routing, not a failed Anthropic payment. Railway currently exposes only
production. Staging was proposed with additional usage cost; the user asked
why that expense was useful and has not approved new hosting. No new Railway
service or provider route was created. Keep completing free local checks; do not
merge around the real-integration gates or reuse the production database.

The sections below preserve the October 15 historical evidence. Their old
budget balances and unobserved-browser notes are superseded by this update.

October 18 frozen validation: raw `npm run check` exited **0** with **810 passed,
3 skipped**, lint/typecheck and production/operations builds passing. Fresh
infrastructure suites passed separately. The regular provider-free 3101 server
was restored, the loopback signup stub stopped, and exact cleanup counts passed.
See [validation details](../qa/customer-review-2026-10-18/final-validation.md).
Existing production Calendar refreshed successfully for the dedicated demo
account on October 18 at 8:57 PM; that remains old-build, read-only evidence.

## Status

The user requested a clean checkpoint and candidate push because session usage
was running low. This is **not a production release or a claim that all gates
passed**. Work remains on `codex/tempo-calm-ui`, PR
[26](https://github.com/chancendahmer/Tempo/pull/26), based on `ab994c0`.
The original checkout has unrelated changes and must remain untouched.

Worktree: `C:/Users/chanc/.codex/worktrees/tempo-calm-ui/Agentic AI Assistant SMS`.
Use the newest checkpoint commit on this branch; this file intentionally does
not embed its own commit hash. Production has not been merged or redeployed by
this run. The old UI remains in production.

## Completed implementation

Latest visual follow-up: sidebar groups now have distinct blue/gold/teal/lavender
badges; Today has larger colored agenda icons and clearer routine/To-do styling.
This is a four-file presentation change with no backend or schema changes.
The independent visual review scored it 8.5/10, limited to this polish. Root
checked mobile navigation and keyboard flyouts; `npm run check` passed again
(804 passed, 3 skipped, lint/typecheck/production/ops builds passed).
See [current design QA](../design-qa.md) for captures and the corrected tablet
button overflow. No additional API budget was spent and no release gate was
closed solely by this review.

- Warm grouped workspace is connected to authenticated account state, with
  visible account identity, logout, empty states, tour, mobile navigation and
  persistent assistant access. Preview fixtures remain explicitly separate.
- Today combines local obligations and honest connected/disconnected Calendar
  state. Tasks can reopen; focus can stop without falsely completing work.
  Goals, routine steps, notes and conversion editors retain their saved content.
- Meals use recipe snapshots and a preserved ingredient serving basis.
  Derived groceries reconcile compatible units, recorded pantry quantities and
  source meals without deleting manual groceries. Purchased is distinct from
  stocked or consumed. Recipe swapping and invalid input retain useful drafts.
- Nutrition has dated diary history, optional targets, manual entries,
  search/barcode portions, recent/favorite/copy/edit/delete workflows, null-aware
  arithmetic and persistent Open Food Facts attribution. Name search now uses
  the documented hosted Search-a-licious endpoint; barcode remains on OFF v3.
- Fitness has six program families, exercise guidance/substitutions,
  customization, scheduled tasks and persistent completed workout logs.
- Per-kind history budgets and account-local diary coverage prevent large food
  histories from hiding routines/targets or understating the selected day.
- Unknown-response UI retries reuse mutation identities within the mounted
  workspace. Routine draft step IDs remain stable. This is not an offline queue
  and does not claim uncertain-write recovery across a browser reload.
- Real-model testing found and fixed nutrition-target authorization and the
  missing atomic multi-reminder cancellation operation. Cancellation checks
  fresh IDs/times, ownership and delivery state and records durable replay receipts.
- Wrong-number signup recovery now revokes the pending browser claim before
  clearing the waiting marker, resets number/consent, and suppresses stale polls.
  Recovery is available even for old or malformed saved waiting markers.
- Assistant navigation guidance now names the new destinations accurately.

## Evidence and scores

See [independent customer review](../qa/customer-review-2026-10-15/authenticated-review.md)
and [backend/rollback audit](UI_RELEASE_BACKEND_NOTES.md).
The reviewer independently exercised authenticated HTTP/PostgreSQL and reviewed
screenshots/code. Browser access was unavailable to that reviewer; root supplied
the browser interactions, clearly labeled in the report.

The exercised local workspace is provisionally **8/10**. Today, To-do, Goals,
Reminders management, Routines, foreground Wake controls, Meals/Recipes,
Groceries/Pantry, Nutrition, Fitness, Brain dump, Settings, tour and captured
navigation layouts each received a scoped local 8. These do not establish an
8 for connected Calendar, actual SMS delivery, signup recovery in the browser,
or the complete released customer journey. Those release gates remain open.

Actual evidence obtained:

- Real PostgreSQL: 20 synthetic accounts, duplicate SMS/web input, four workers,
  two dispatchers, isolation and recovery checks. Four real worker-process
  termination boundaries were tested, including the five-minute lease delay.
  Transport was captured, not actual SMS. Ambiguous acceptance remains safely
  failed/blocked for audited recovery; it is not automatic redelivery.
- Independent authenticated HTTP checks: 19 acceptance groups covering empty
  accounts, CRUD, stale/foreign rejection, origin protection, duplicates,
  metadata preservation, settings, focus and history boundaries.
- Live Claude synthetic transcripts: workspace and focused suites passed;
  the extended suite exposed target failures, then the fresh target-specific
  correction replay passed. Keep original failures as evidence.
- Real model + real local PostgreSQL/pg-boss + actual browser: saved note
  appeared and survived reload; two reminders were created, moved with IDs
  preserved, then cancelled. The first cancellation failed before repair;
  the fresh repaired replay succeeded, all corresponding jobs were cancelled,
  and the re-signed-in browser showed the reply and zero active reminders.
- Actual food provider in the browser: typed barcode lookup and a plain-yogurt
  name search succeeded. 150 g at 53 kcal/100 produced 79.5 kcal, persisted on
  reload; together with the 80.9 kcal barcode entry the diary showed 160.4.
- Root tested 390 px phone and 1920 px touchscreen layouts; selected workflows
  survived reload/re-login. This is not exhaustive accessibility certification.

Validation logs are local and ignored by Git. `release-2026-10-15-verified-check.log`
passed 779 tests earlier. `release-2026-10-15-final-check.log` passed after the
cancellation fix. `release-2026-10-15-checkpoint-check.log` caught three expected
red navigation assertions during a concurrent red/green edit; do not cite it as
passing. The final frozen checkpoint validation is recorded in the next section.

## Final frozen validation

`npm run check` finished with exit **0** on the frozen candidate:

- Lint: passed, no warnings.
- Typecheck: passed.
- Tests: **804 passed, 3 skipped**; 106 files passed, 2 skipped.
- Production Next.js build and operations TypeScript build: passed.
- `git diff --cached --check`: passed after removing one trailing blank line.

Log: `qa/release-2026-10-15-frozen-check.log` (local, ignored). The PostgreSQL
concurrency/restart checks listed above were run separately with explicit local
database configuration; the default suite skips those opt-in infrastructure
tests. No tests or providers are claimed from skipped cases. Only documentation,
review evidence and whitespace changed after the final runtime edits froze.

## Access and paid testing

The user completed production demo sign-in and Google authorization during this
run. Root verified the production workspace identifies Tempo Demo, phone ending
8736, and Google Calendar refreshed successfully with no events on October 15.
That is the **existing production build**, not the candidate. TextFree is logged
in. Do not sign out these sessions unnecessarily. No personal customer records
were edited and no live fictional Calendar/SMS tests were sent in this run.

Paid-test cap: **$10 total**, shared across all agents/providers/retries.
Current measured Claude usage: **$5.357775**. Conservatively committed:
**$5.541060**, including an unreconciled reserve for an unknown network outcome.
Remaining conservative allowance: **$4.458940**. Do not discard that reserve.
The local ledger is `qa/release-2026-10-15-live/cost.json`, using a $7 local cap
to preserve production verification funds. No agent ran independent paid calls.
Do not restart accounting or treat this as a fresh $10 budget on continuation.

Normal secure credential loading uses `TEMPO_TEST_ENV_DIR` pointing at the
original checkout. Never read populated environment files or print credentials.
Local configured Anthropic model was `claude-sonnet-4-6`; actual metered calls
worked. Railway and local environments are separate.

## Resume in this order

1. Read AGENTS.md, this checkpoint, independent review and backend notes. Verify
   worktree/branch/status and existing live browser sessions. Do not re-seed or
   overwrite the user's personal account. PR stays draft until gates pass.
2. Browser-test wrong-number waiting recovery, including a late old-link
   verification and failed logout. Its unit/integration tests and independent
   source audit passed; actual browser recovery remains unobserved.
3. Establish a safe candidate test deployment/runtime for the real dedicated
   demo account and provider callbacks. Existing local runtime uses an isolated
   database and has no SMS/Google credentials; existing production still runs
   the old UI. Do not point disruptive tests at production or describe old-build
   checks as candidate acceptance. Review deployment/version compatibility first.
4. Within remaining paid budget, verify a fresh SMS request creates account
   state visible in candidate UI, a UI edit is recalled by SMS, a confirmed
   Calendar write/read/delete, and a scheduled reminder actually arrives in
   the dedicated TextFree inbox. Capture sanitized evidence without login links,
   tokens or personal data. Clean up only clearly labeled records made for these
   tests. Avoid broad outbound tests or reprocessing old jobs.
5. Independent reviewer reruns remaining journeys and scores each actual scope.
   Use fresh scenarios and distinguish scripted, live-model, database, browser,
   Calendar and carrier evidence. Fix concrete defects and rerun affected checks.
6. Only when all requested gates pass, update PR26, merge, coordinate web/worker
   deployment at the same compatible revision, verify readiness and actual demo
   flows, and record deployed SHAs. See rollback notes; old binaries can strip
   newly introduced JSON fields, so a simple revert is not a verified rollback.

## Local runtime left for continuation

- Candidate UI: `http://localhost:3101/workspace`; fictional design preview:
  `http://localhost:3101/workspace/preview`. Older 3100 preview may still run.
- PostgreSQL 17 cluster: `C:/Users/chanc/AppData/Local/Temp/tempo-ui-release-pg17`,
  localhost port 55437, database `tempo_ui_release`; recovery database
  `tempo_ui_release_recovery_test`. Only synthetic data; no broad SMS dispatcher.
- Start/resume commands and exact scope are in
  [PostgreSQL verification](../qa/customer-review-2026-10-15/postgres-verification.md).
  `seed-local-account.ts` produces normal one-time links for populated, empty or
  outsider QA accounts. Do not save bearer links in artifacts or source.
- `local-web-message-live.ts` processes only an explicitly selected synthetic
  inbound and its one job through real pg-boss. Use its shared budget guard;
  never run an unrestricted production worker against these fixtures.

## Short customer/investor walkthrough

On the populated local QA account: Today → start/pause/stop a focus task;
Planner → goal and steps; Daily rhythm → routine checks and user-started sunrise;
Food & fitness → recipe → plan servings → derived groceries/pantry → log a
separate eaten food → select/customize a program and log a workout; Brain dump
→ capture a thought and convert it to a task. Ask Tempo can show the saved
fictional note and successful reminder lifecycle from the live-model proof.
State explicitly that the local demo is synthetic and that device wake,
background alarms, physical brightness, camera scanning and audible hardware
behavior have not been verified. Google Health remains unsupported.
