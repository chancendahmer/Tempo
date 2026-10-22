# Adaptive Home follow-through — 2026-10-21

This is the second pass on `codex/tempo-adaptive-home`, based on `95d7d1d`. The work remains in the separate adaptive Home worktree. No push, merge, production migration, or deployment was performed. Original checkout and earlier designs are preserved.

Implementation checkpoint: **`864fecb`**. Reviews captured that working tree before commit; the final full check passed on the same source. Subsequent documentation/screenshot commits do not change application code.

## Completed

- The activity banner now starts the actual scheduled movement task with its displayed timer; a Calendar activity opens Calendar instead of an unrelated fitness template.
- Home preferences and task icon/timer dialogs keep keyboard focus inside and return focus to the opener on Escape.
- Focus help includes the current task title in the draft. It remains a draft until the user sends it.
- Meal cards use shorter photos and tighter secondary controls while preserving readable ingredients and comfortable controls.
- Compact ingredient quantities such as `500g` scale correctly with servings, compatible units, and explicitly recorded pantry stock. Shopping labels show readable fractions/approximate decimals without changing stored arithmetic.
- Completed workouts cannot be dated in the future. The assistant uses its trusted decision time and the account's timezone; HTTP uses server time. Clients cannot supply a clock override.
- Added repeatable authenticated HTTP coverage for adaptive Home preferences, manual categories/timers, simultaneous submissions, durable focus, conflicts, and account isolation.

The underlying Home already supports a configurable time-based banner, persistent to-do/calendar areas, contextual category and starting-time suggestions, manual overrides, an optional navigation drawer, Spaces, and Journey. See the [initial implementation checkpoint](../adaptive-home/README.md) for that scope.

## Independent reviews

| Reviewer | Initial | Final | Evidence and limits |
| --- | --- | --- | --- |
| Novice customer | 7/10 for the broken movement journey | 8/10 overall | [Ten interactive journeys and subsequent attributed visual checks](customer-review.md). Independently verified the repaired matching timer. Preview interaction, not live provider certification. |
| Professional UI designer | 7.8/10 | 8.4/10 | [Desktop/mobile, keyboard, Home, Journey and section checks](designer-review.md). Independently re-tested both keyboard loops and the movement action. Final meal spacing assessed from fresh root-captured screenshots because the resumed reviewer's browser connection was unavailable. |

These scores cover the reviewed UI and journeys. They are not an all-sections production-readiness score and cannot replace release gates.

## Validation

- Full `npm run check`: **passed** — lint, typecheck, **878 tests across 120 files**, Next.js production build, and operations/worker TypeScript build; two environment-dependent files / three tests skipped in that command and exercised separately below. The first run caught a workout clock mismatch in the scripted 2027 release journey (876 tests passed, one failed, three skipped). Fixed by propagating the existing trusted orchestration clock; fixture dates and the future-date rule were not weakened. The five affected suites then passed 55 tests before the successful full rerun.
- Existing authenticated HTTP journey: **19 acceptance groups passed**, including activation/replay denial, empty accounts, tasks/goals, focus, routines, notes, nutrition, fitness, large histories, invalid origins and foreign-account protection. Command: `npx tsx qa/customer-review-2026-10-15/authenticated-http.ts http://localhost:3103 --history-boundary`.
- New adaptive Home HTTP journey: **10 acceptance groups passed**, with independent SQL reads. [Detailed results](authenticated-home.md), [repeatable script](authenticated-home.ts).
- Real PostgreSQL concurrency: **one test passed**, exercising 20 synthetic accounts in an isolated local database. No production load was generated.
- Real PostgreSQL recovery: **two tests passed** against a fresh local database. The initial attempt used an old synthetic recovery database lacking current schema columns; a new isolated `_test` database with the current migration chain resolved the infrastructure error. Existing fixture data was preserved.
- Scripted assistant simulation: **33 scenarios, zero detected issues**; a separate focused suite passed **258 tests**. [Evidence and scenario mapping](assistant-workflows.md). Fixture responses and captured tools are not live model output.
- Food/fitness arithmetic and persistence: [backend evidence](backend-workflows.md), including the observed pre-fix failures and regression coverage.
- No paid API calls in this pass: **$0**. No customer texts, Calendar writes, or production records were touched.

### Signed-in browser journey, performed by the main agent

These checks used a newly created synthetic **QA Riley** account in local PostgreSQL at `127.0.0.1:55437/tempo_ui_release` and the candidate at `localhost:3103`. Normal one-use sign-in link confirmation established the browser session. No provider key or customer account was involved.

1. The existing saved focus opened with the correct task title. Pause held at **5:30** across a full reload. [Screenshot](account-focus-reload.png).
2. Feeling stuck opened an unsent draft naming **Write a short project outline**, matching the paused focus. [Screenshot](account-smaller-step.png).
3. Customize Home showed the saved times and workout lead. Changing dinner from **18:30 to 19:00** showed a save confirmation and survived reload. [Screenshot](account-home-prefs-reload.png).
4. Completing the focus removed that task from the unfinished list and advanced the banner to the remaining packing task. Another reload retained the completion. [Screenshot](account-completion-reload.png).
5. Profile showed **QA Riley** and the masked synthetic phone. Switch account / Log out returned to the phone login page. The local session was signed out after testing.

Separately, in the fictional preview, a dinner swap generated readable grocery quantities and retained manual entries/source-meal links. Phone meal rendering at a 390px viewport had a measured 390px document width. The viewport was restored after testing.

## What remains

1. **Live integration and release evidence:** exercise the candidate's actual model/worker, task-icon suggestion job, web search, dedicated demo SMS round trip and delivered reminder, and real Google Calendar read/confirmed write. None was certified by this local pass. Reconcile the existing paid-test ledger before spending more of the previously authorized aggregate cap. Do not provision paid staging without authorization.
2. **Complete release review:** finish authenticated, current-build reviews of every section and the complete novice onboarding journey; add a fresh simulated-week live-model sample. Current UI scores do not average away an untested section. Preserve consent, quiet-hour, isolation and recovery gates.
3. **Nutrition/device checks:** verify the live food catalog, barcode product lookup, denied-camera fallback and actual phone camera behavior. Hardware brightness, sleeping-device wake, and reliable background alarms remain unverified capabilities.
4. **Small product polish:** make thought-to-task conversion link to the resulting task; improve destination-specific save feedback; clarify that task symbols represent categories and influence activity suggestions; improve plural quantity labels and optional overdue explanations. These were minor review findings, not blockers to the current preview score.
5. **Fitness follow-through:** decide whether an active selected program should persist independently, and whether logging a scheduled workout should offer to complete its matching task. Today these are intentionally separate records; no completion is fabricated.
6. **Release preparation:** integrate this approved isolated branch with the intended release branch, apply additive migration `0031` through the normal migration runner, deploy matching web and worker versions, verify production canaries, and retain rollback. No automatic merge is justified by preview scores alone.

## Demo walkthrough

Open `http://localhost:3103/workspace/preview`. Select sample **8:10 AM** for the routine, **3:05 PM** for the walk, and **6:00 PM** for dinner. Start the walk directly, pause and return Home, then complete it. Change a task's icon and starting minutes. Open Meal plan, swap dinner, and visit Groceries to inspect the source-linked ingredients. Open Your journey. This preview is explicitly fictional and resets on reload.

## Resume and rollback

- Preview launcher: `node qa/adaptive-home/start.cjs`; retain the isolated localhost database when checking persistence.
- The new HTTP script uses exact local allowlists and public test configuration. `local-sign-in.json` is deliberately ignored because it contains a short-lived local fixture bearer link. Do not publish it.
- This pass adds no schema migration. The prior adaptive Home migration is additive; previous application/worker versions can ignore its column/preferences. Roll back code without dropping data.
