# Candidate continuation — October 18, 2026

Candidate: `codex/tempo-calm-ui`, PR26; baseline `d1d866c`. The new source
changes are the small Today, Goals, Reminders and Fitness fixes described below.
Use the commit containing this record for their frozen revision. Environment:
isolated local PostgreSQL and Next.js at `http://localhost:3101`; fictional
Local QA Alex (0199), empty and conflicting-account fixtures. Production was
inspected read-only and retains the old UI.

## Results and limits

| Evidence | Actual result | Boundary |
|---|---|---|
| Authenticated HTTP | 19 acceptance groups passed | Real local routes/PostgreSQL; no carrier or Google |
| Diary date/history | Account-local boundary and complete/truncated history passed | Synthetic Honolulu account; no wearable data |
| Concurrent isolation/recovery | 2 files / 3 tests passed, 20 accounts | Four workers, two dispatchers, captured transport/scripted model |
| Assistant regression transcript | 33 turns, zero recorded issues | Scripted; not live-model output |
| Live Claude + local worker | Saved food → actual `life_list` → `life_save` note passed | One selected web job, real PostgreSQL; no SMS or Google |
| Browser persistence | Food, workout and note reloaded; food/note survived sign-out and normal re-login | Root-operated real authenticated local UI |
| Wrong-number browser recovery | Original pending number cleared; second submitted; return to sign-in passed | Stubbed contact preparation only; no external message |
| Revoked-link server behavior | Late original-session token rejected, replacement claim retained | Real HTTP + isolated database; foreign-origin 403 also checked |

Detailed account assertions: [account-validation.md](account-validation.md).
Signup boundaries: [waiting-recovery-setup.md](waiting-recovery-setup.md).
Independent visual findings and attribution: [mobile-review.md](mobile-review.md).
The prior October 15 real worker-process crash drill remains historical evidence;
it was not rerun in this presentation-only continuation.

## Changes made after review

- Today explicitly marks carried-over task dates `Overdue` in the current card
  and checklist, using the account-local date without changing task selection.
- Goals with all linked steps complete expose `Mark achieved` directly.
- Reminders distinguish overdue scheduled items from upcoming and delivered
  records without changing their actual delivery state.
- Fitness places completed history beside logging and program choices before
  the selected template's exercise details. Existing handlers/state are retained.

Final raw `npm run check` exited **0**: lint and typecheck passed; **810 tests
passed, 3 skipped** (106 files passed, 2 skipped); production Next.js and
operations builds passed. Infrastructure suites were separately run with
explicit isolated database URLs. See [final-validation.md](final-validation.md).
No runtime source changed after this check.

## Local visual review scores

| Depicted section | Score | Important qualification |
|---|---:|---|
| Today; To-do; Goals | 8 each | Post-fix captures for Today/Goals |
| Calendar | 8 | Disconnected state only; connected Google gate open |
| Reminders | 8 | Management/overdue display; actual delivery gate open |
| Routines | 8.5 | Root also paused/reloaded/stopped routine focus without checking the step |
| Wake/wind-down | 8.5 | Foreground controls and sunrise sample; device sleep/background audio unverified |
| Meals; Recipes | 8 each | Dinner image verified after scroll; full-page lazy capture was incomplete |
| Groceries/pantry | 8.5 | Clear purchased/stocked distinction; reconciliation has separate HTTP/tests |
| Nutrition | 8 | Manual save, totals, reload and re-login observed; prior provider lookup evidence retained |
| Fitness | 8 | Root's independent post-reorder review; reorder author does not independently approve it |
| Thoughts; Memories; Ask Tempo | 8 each | Captures plus root live web action; candidate SMS round trip remains untested |
| Settings; Tour | 8 each | Captured settings/first step; root traversed all four tour steps |
| Signup recovery | 8 | Desktop visual scope and actual local-route test; no phone verification delivery |

These scores apply to exercised local scopes. **The complete released customer
journey is unscored and not cleared for release.** Screenshots do not establish
all keyboard/accessibility states, physical phone behavior, scheduled delivery,
provider callbacks or production capacity. Root's current local workflow
assessment is 8/10, supported by the scoped evidence rather than a replacement
for these missing gates.

## Spending and cleanup

This continuation used $0.189555 in actual Claude calls. Original-run totals:
$5.547330 measured / $5.730615 conservatively committed / $10 aggregate cap.
The reserve for the prior unknown outcome remains included. No new hosting,
subscriptions, SMS lines or other services were purchased.

The new `QA Oct18 oatmeal`, `QA Oct18 breakfast recap` and `QA Oct18 evening
walk` records were removed through the normal UI. Prior fixtures were retained.
New reserved-number signup fixtures are contained in the disposable database;
none has scheduled outbound jobs. Logs are ignored; no bearer links/cookies or
populated environment files are saved in this evidence package.

Read-only post-test database counts independently confirmed both browser signup
fixtures have zero scheduled actions and all three exact new test titles are
absent. The local stub was stopped after recording five accepted contacts and
three intentional rejected smoke requests. The regular provider-free candidate
was restarted at 3101; health returned 200 and unauthenticated workspace access
returned 401.

## Remaining release gates and next action

Before merge, establish an isolated candidate runtime/database and independent
demo SMS routing, then verify fresh phone sign-in, SMS → dashboard → SMS,
confirmed Google Calendar create/read/delete, and a scheduled reminder arriving
at the dedicated demo inbox. Review both web and worker deployment revisions
and migration/rollback compatibility. Do not connect the unrestricted candidate
worker to production's database or redirect an accountwide production webhook.

The lower-cost local one-job integration alternative and its evidence limits
are documented in [the deployment audit](../../docs/UI_RELEASE_RESUME_AUDIT.md).
It can advance outbound/Calendar proof without new hosting, but needs fresh
candidate OAuth and a reviewed bounded provider runner; it cannot prove normal
candidate SMS ingress or a complete Railway deployment. No new service was
created pending the user's hosting decision.

Root additionally refreshed the existing production demo account's Google
Calendar on October 18 at 8:57 PM America/New_York. It displayed connected and
no events for that day; capture 28 records this **old production build baseline**.
No Calendar record was changed. This does not close candidate Google acceptance.

## Short demo

Use the synthetic Local QA account: Today → start/pause a focus session →
Planner goals → Daily rhythm routines and manual sunrise → Food & fitness
recipe/meal ingredients/shopping → Nutrition diary → fitness program and
completed log → Brain dump thought → Ask Tempo. Explain that planned food is
not eaten food, purchased is not stocked, and foreground light is not a
verified hardware alarm. The fictional Alex preview is a separate design view.
