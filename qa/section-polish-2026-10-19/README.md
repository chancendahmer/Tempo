# Section polish — 19 October 2026

Candidate: `codex/tempo-calm-ui`, PR #26, changes over `2a36936`.
Local runtime: `http://localhost:3101/workspace/preview`.
No production changes or paid API calls in this pass.

## Design and sources

The approved Today screen stays intact. The remaining apps share navigation,
spacing and controls, while keeping different working structures:

- Planner: scannable task groups, real goal labels and estimates, a stable
  Monday–Sunday calendar strip, distinct task/event/reminder rows.
- Food: compact calorie/macro summary, meal-grouped diary, searchable recipe
  image cards, explicit planned/shopping/purchased counts.
- Fitness: program cards, reusable plans separate from completed logs, an
  immediately available default-plan save action.
- Daily rhythm: warm morning and muted evening tracks, clearer next steps,
  quieter checkoff rows and a restrained light-session presentation.
- Brain dump: readable notebook rows, title-and-body search, clear full-text
  disclosure, original-note preservation when creating a task or goal.

Primary-source comparisons and observed changes:
[Planner](planner.md), [Food and fitness](food-fitness.md),
[Rhythm and Brain dump](rhythm-brain.md).
These cite official Todoist, Things, Motion, Fantastical, MyFitnessPal, Paprika,
Hevy, Strong, Tiimo, Structured, Finch, Bear and Apple materials. Public screenshots
and guides are distinguished from authenticated hands-on use. No competitor
assets were copied into Tempo. Mealime is a historical visual reference only;
its site announced closure when researched.

## Independent review

[Full review](customer-review.md): **8.0 → 8.2/10 for the scoped desktop UI**.
This is an expert novice-user heuristic evaluation, not a recruited customer
study, clinical finding or production-readiness rating.

Confirmed repairs: food and workout dialogs restore keyboard focus; default
workout plans can be saved at the top of their editor; goal-step editors identify
the selected goal. Reviewer independently rechecked those actual interactions.
Root also changed the generic meal editor to neutral wording and removed
worker jargon from Settings. The review's earlier P3 wording findings predate
these final copy changes.

| Section | Independent score |
|---|---:|
| To-do | 8.4 |
| Goals | 8.3 |
| Calendar | 8.1 |
| Reminders | 7.7 — live creation unverified |
| Routines | 8.6 |
| Sunrise/sunset | 8.3 |
| Meal plan | 8.3 |
| Recipes | 8.5 |
| Groceries/pantry | 8.0 |
| Nutrition | 8.3 |
| Fitness | 8.1 |
| Thoughts | 8.6 |
| Memories | 7.8 — live creation unverified |
| Ask Tempo | 7.8 — preview only |
| Settings | 8.1 |

The lower/unverified scores are retained. The overall UI score does not close
the previously recorded release gates or establish every section at 8+.
A separate read-only correctness review found no reproducible P1/P2 in the
changed source and ran the nine new tests successfully.

## Root browser verification

- Actual authenticated **local synthetic** account (phone ending 0199), using
  normal session redemption and isolated PostgreSQL on loopback port 55437.
- Captured a fictional note, searched a body-only word, reloaded, changed only
  its title, verified body preservation, removed it and verified removal after
  reload. Existing notes stayed present.
- Logged a fictional Lunch entry with 95 kcal and unknown macros. Actual saved
  totals showed 95 and unknown/partial nutrient labels, focus returned to Lunch
  Log food, and the entry survived reload. Removed this run's food afterward.
- 390 × 844 browser reflow: To-do, Calendar, Routines, Sunrise/sunset, Recipes,
  Groceries, Fitness, Thoughts and Nutrition showed no horizontal page overflow.
  Calendar, routines, fitness, notebook and Nutrition screenshots were visually
  inspected. Mobile food controls were tightened into two rows.
- Normal desktop preview and local account data are distinct. Preview records
  reset on reload; the authenticated account checks above survived reload.
- All tests in this pass were isolated. No production account or provider data
  changed. Real-model SMS, Calendar writes, camera scanning, device wake/audio,
  or production deployment were not revalidated.

Screenshots and command logs are local ignored evidence, not public assets.
Examples: `mobile-calendar.jpg`, `mobile-routines.jpg`, `mobile-movement.jpg`,
`mobile-inbox.jpg`, `mobile-nutrition.jpg`, `account-note-reload.jpg`,
`account-note-removed.jpg`, `account-nutrition-persisted.jpg`, plus agent reports'
named before/after captures. Temporary synthetic session artifacts stay ignored.

## Validation

Nearest section tests passed during iteration, including 9 new tests across
Nutrition, Thoughts and Planner. Final `npm run check` exited 0: lint and
typecheck passed; **113 test files passed / 2 skipped, 843 tests passed / 3
skipped**; Next.js 16.3.6 production build and operations TypeScript build passed.
Expected mocked billing/auth/provider failures in the test log are test fixtures,
not real Anthropic requests. API spending for this pass was **$0**.

## Remaining work

Revalidate assistant-dependent reminder/memory creation and cross-channel
retrieval against the candidate with configured providers. Verify real demo SMS
arrival and confirmed Google Calendar changes before release. Keep the existing
preview/account distinction and the unchanged release gates in
`docs/UI_RELEASE_CHECKPOINT.md`. Purchased groceries still require explicit
pantry entry; the app does not infer stock or consumption from a checkbox.
