# Food and fitness backend follow-through — 2026-10-21

Scope: local candidate in `codex/tempo-adaptive-home`. All database checks below use a fresh in-process PGlite database with the repository's SQL migration chain and synthetic accounts. No real accounts, live models, provider messages, production database, deployment, or paid API calls were used.

## Implemented in this pass

- Compact recipe amounts now enter the existing deterministic quantity pipeline: `500g rice`, `250ml milk`, `1/2kg rice`, `1½cups flour`, and `2tbsp. olive oil`. They scale with meal servings, merge under existing compatible-unit rules, and subtract explicit pantry quantities. Unsupported units, ranges, compact item counts, multiplication, and malformed fractions remain opaque text.
- Completed workout create and patch operations now reject a date after the account-local day. The shared workspace mutation protects both HTTP callers and `LifeAssistant` commands; this is no longer only a client editor rule. The error directs future intent to a scheduled task. Reusable workout plans and future tasks remain supported.
- Shopping and pantry labels now show common fractions for count/kitchen units and concise decimal metric amounts. Examples: `about ⅔ onion`, `about 1⅓ carrots`, `1½ cup flour`, `about 266.7 g tomatoes`. Approximate labels say so; tiny positive quantities remain positive in the label. This only formats the display and does not round stored quantities, meal sources, serving arithmetic, or pantry subtraction.
- Regressions were observed before the fixes: the compact-unit unit test failed on `500g rice`; the workout integration tests showed future creates/updates returning `Saved.`.

## Fresh verification

`npm run test -- src/server/domain/meal-groceries.test.ts src/server/db/repositories/meal-groceries.integration.test.ts src/server/domain/workout.test.ts src/server/db/repositories/fitness.integration.test.ts src/server/db/repositories/workspace-repository.integration.test.ts src/app/workspace/nutrition-model.test.ts src/app/workspace/workout-plans.test.ts src/server/adapters/food/open-food-facts.test.ts`

Result: **8 files, 70 tests passed**. This reran existing coverage as well as new regressions:

| Workflow | Freshly exercised evidence |
| --- | --- |
| Recipe → meal servings → groceries | Account-owned recipe snapshot and original serving basis; serving changes; UI/SMS commands; duplicate retries; source removal; old-date expiry; grocery checkbox preservation. New compact-unit case merges two rice quantities, scales a four-serving meal, subtracts half a kilogram of pantry rice, changes back to two servings, and verifies stable repeated reads. |
| Pantry and quantity safety | Explicit compatible pantry amounts reduce needs; unknown amounts do not remove needs; pantry removal restores the requirement; purchase checkboxes do not create pantry stock; generated grocery source forgery/edit/delete is rejected. |
| Nutrition arithmetic | Catalog portion scaling; known zero versus missing nutrients; partial/empty totals; portion repeat scaling; oversized portion rejection; retained source metadata; nullable self-chosen targets. Food provider tests use mocked responses. |
| Workout plan → schedule → completed log | A saved plan produces one future task across retries, without a completed workout. An assistant-created actual 18-minute log retains its plan/session link across retries; the reusable plan and scheduled task remain separate. Existing template/customization tests also passed. |
| Completion dates and edits | Account-local today is accepted; future create, full replacement, and assistant patch are rejected; failed edits preserve the stored version/data. Unit checks cover New York versus Kiritimati across a UTC date boundary. |

`npm run lint` and `npm run typecheck` passed; typecheck was rerun after the final integration case was added. `git diff --check` passed on the owned tracked source/test files. The parent task owns the final broad `npm run check` and browser/HTTP evidence after changes settle.

Follow-up after the label change: the focused assistant/safety/food run passed **17 files / 258 tests**, including the ingredient unit and transactional grocery tests. `FoodViews.test.ts` passed its **2 tests** separately. Lint and typecheck both passed again. See [assistant workflow evidence](assistant-workflows.md) for the complete focused command and the separately labeled scripted simulation.

### Injected clock follow-up

The parent's combined check exposed a mismatch in the new workout validation: the assistant simulator supplied January 14, 2027 as its decision time, while the workspace gate used ambient machine time and rejected a same-day completed log. The original release scenario and a new focused regression both failed before the repair; their dates were preserved.

The trusted decision timestamp now passes from `ConversationOrchestrator` through `LifeAssistant.execute` into the optional internal `mutateWorkspace` clock argument used by workout validation. It is not part of the action schema; normal HTTP callers use server current time. The new regression accepts the simulator's same-day log and valid duration edit, while rejecting tomorrow's create and date patch across SMS/web channels without state changes.

Fresh command: `npm run test -- src/server/testing/release-extra.integration.test.ts src/server/domain/workout.test.ts src/server/db/repositories/fitness.integration.test.ts src/server/db/repositories/workspace-repository.integration.test.ts src/server/db/repositories/conversation-orchestrator.integration.test.ts`.

Result: **5 files / 55 tests passed**. Lint and typecheck passed after the repair. No network/provider calls were used. The parent owns rerunning the final combined check.

## Supported limits and outstanding evidence

- Unit normalization remains intentionally limited to existing families: g/kg, ml/l, oz/lb, and tsp/tbsp. It does not convert between mass and volume, infer density, infer ingredient synonyms/plurals, interpret arbitrary package sizes, or assume a regional cup size.
- Unknown ingredient quantities and unsupported textual formats are preserved for the user; they cannot be reliably scaled or subtracted from quantified pantry stock.
- These are direct repository/domain and render/model tests. They do not establish browser persistence, real PostgreSQL concurrent behavior, live food catalog availability, camera barcode scanning, live SMS/LLM behavior, Google Calendar integration, or production readiness.
- Template selection/session viewing remains UI state. Durable saved plans, scheduled tasks, and completed logs are separate records. This pass does not introduce a durable active-program preference or automatic completion of a scheduled task from a workout log.
- Workout plan/session links are metadata; this pass does not add referential integrity, automatic history rewrites when a plan changes, or rejection of historical links after a plan is deleted.
