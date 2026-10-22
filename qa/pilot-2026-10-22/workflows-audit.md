# Private pilot workflow audit — 2026-10-22

Source inspected in `codex/tempo-adaptive-home`, starting at `d7e1a0e`. Product source was read-only during this audit. No paid model/provider calls, secret files, customer records, or production writes were used. Existing Home composition and artwork should remain intact.

## Recommendation

Ship a durable thought-to-task relationship and close the verified workout saved-plan reference integrity defect. Pair these with small category, saved-plan, and grocery wording repairs. The useful food workflow already exists: save recipe → plan servings/date → automatic source-linked groceries → mark purchased → separately record pantry stock / food eaten. Expand the explanation and quantity grammar before adding another food feature.

Do not add inferred workout task completion or a new active-program feature in this pass. Both require a product relationship that the current records do not represent. The existing saved-plan library is durable; choosing a template is temporary browsing state.

## Prioritized findings

| Priority | Finding and evidence | Bounded response | Proposed ownership |
| --- | --- | --- | --- |
| P1 | **Thought conversion can create duplicates and has no backlink.** `ThoughtsView.tsx:39` always renders Add to To-do. `WorkspaceClient.tsx:342–349` creates a normal task from the title; the note callback near the ThoughtsView render passes only a title/minutes draft. `life-items.ts:16` note data has no relationship field. `ThoughtsView.test.ts` tests search, full-text access and coverage, but no conversion. New conversions receive new request IDs, so general replay protection cannot deduplicate them. | Introduce an explicit account-owned transactional convert-note action. Create task and record its ID together; repeated conversion returns the existing task. Preserve full original note. Card and save feedback offer View task. Do not deduplicate by matching title. | Root integrates `WorkspaceClient.tsx`, shared action/schema/repository and tests. Workflow engineer can own `ThoughtsView.tsx` + its tests after root agrees interface. |
| P1 | **Verified invalid saved-plan references can persist across web and assistant channels.** `workout.programId` in `life-items.ts:15` accepts any UUID. `workspace-repository.ts:168–179,182–230` checks row ownership, versions, future completion dates and some other relationships, but not programId owner/kind. `life-patch.ts` exposes that field to assistant patch. The isolated QA probe saved a workout referencing a neighbor's real plan, then assistant-patched it to a nonexistent plan. Both persisted. The neighbor's plan itself remained unreadable: this is relationship integrity, not an observed data leak. | Validate any newly added/changed programId refers to an account-owned workout_plan in both save and patch. Keep logs after deletion of their own plan; permit unrelated edits to historical logs with unchanged now-missing reference, or strip links consistently on plan deletion. Choose one explicit behavior and test it. | Root owns shared repository/schema. Add regression cases to `workspace-repository.integration.test.ts`; replace/remove audit characterization probe after repair. |
| P2 | **Task symbol wording understates category behavior.** `TodayView.tsx:90,119` calls it icon; `home-model.ts:37` uses category fitness to choose movement activity. Changing Movement → Personal changes Home suggestions. | Label category and icon together; explain that the category helps choose activity suggestions and a manual choice wins. Preserve controls/layout. | Workflow engineer can own narrow `TodayView.tsx` text; root coordinates Home edits. |
| P2 | **Temporary template choice can look like saved commitment.** `FitnessView.tsx:24–25` selects first program/session with useState on mount; `SavedPlanCard` also initializes session zero. “Selected template” is browsing state, while Make this my plan persists workout_plan via normal save. Saved plan editing already has conflict coverage in `workout-plans.test.ts`. | Clarify the temporary selector as Viewing template; explain saving a customized plan keeps it in Your saved plans. Do not store state in localStorage, where accounts could inherit another account's choice. Active-plan preference is a separate future feature. | Workflow engineer owns `FitnessView.tsx` and nearest rendering/copy checks. |
| P2 | **Workout scheduling and logging have no task relationship.** `workout-programs.ts:38–40` draft has only title/minutes; `FitnessView.tsx` scheduled-plan action passes that draft; logs retain optional programId/sessionName but no taskId. Existing helper explicitly says completion logged separately. `workout-plans.test.ts` guards against invented completion. | Make separate behavior equally clear by saved-plan actions and log editor. Do not complete tasks by title similarity. A future explicit task link and opt-in complete-this-task action would need atomic/versioned semantics and duplicate handling. | Workflow engineer copy only. Relationship feature deferred. |
| P3 | **Quantity presentation still uses singular unit tokens.** `meal-groceries.ts:54–56` prints stored units directly; tests explicitly expect “2 slice bread”, “1½ cup flour”, “2 cup rice”. Arithmetic/fractions are already covered and should remain unchanged. | Pluralize count/volume word units (cup, slice, clove, can, package) for quantities other than one; retain metric/abbreviated units. Avoid trying to singularize ingredient names (onions/carrots or free text). Explain approximate amounts remain estimates. | Workflow engineer owns `meal-groceries.ts` + test and minimal `FoodViews.tsx` copy. |

## Acceptance cases

1. Capture a long thought, save, navigate away and reload. Full text remains available. Convert with a shorter edited title: one task is saved, original note remains exact, card shows View task, and the saved task can be opened/started/completed.
2. Repeat convert from the same thought, retry after a lost response, and submit concurrently from two tabs: one relationship and one task. Another account cannot convert or follow the note/task IDs. A completed linked task remains an explicit completed link; a removed task has a clear recovery state rather than silently creating another task. Changing the note does not overwrite the task.
3. A newly assigned foreign, missing or non-plan programId is rejected from web create/update and assistant create/patch without any other mutation. Own-plan log succeeds. Removing a plan retains completed movement; editing notes on that historical log follows the chosen missing-link policy.
4. Movement task category editor explains why changing category can change the activity banner. Manual category/timer survives refresh and a later suggestion. Starting timer/due-date semantics remain unchanged.
5. In Fitness, viewing a different template makes no persistence promise. Saving a customized plan survives reload and account switching returns the appropriate account's own library. Logging completed movement leaves a separately scheduled task open and explicitly explains that behavior.
6. Food journey: save a recipe, schedule 4 portions from a 2-portion recipe, inspect source-linked grocery quantities; swap recipe, change servings and toggle shopping off/on; manual groceries remain separate. Purchase checkboxes do not create pantry stock or a nutrition log. Recorded pantry amount is deducted. Counts display “1 slice”, “2 slices”, “1½ cups”, “2 cloves”; numeric storage and calculations are unchanged.

## Persistence assessment and test evidence

Existing `workspace-repository.integration.test.ts` explicitly covers shared assistant/app CRUD for notes, workouts, meals and routines; cross-channel nutrient correction; account isolation; stale writes; request replay; durable focus clearing; old diary coverage. `task-repository.ts:105–106` clears task-associated focus on completed/abandoned transitions at the shared repository, so the inspected code does not support a claim that SMS task completion leaves a timer behind.

No broader cross-account record exposure or cross-channel save-loss defect was found in this bounded audit. The programId integrity failure above is confirmed. Live model, worker, SMS delivery, calendar and hardware behavior were not certified.

Commands run:

- `npm run test -- qa/pilot-2026-10-22/workflow-probe.test.ts src/app/workspace/ThoughtsView.test.ts src/app/workspace/workout-plans.test.ts src/app/workspace/FoodViews.test.ts src/server/domain/meal-groceries.test.ts`: four source suites, **15 tests passed**. The standard config excludes QA paths, so the probe was **not** run by that command.
- `npm run test -- --config qa/pilot-2026-10-22/workflow-probe.config.mts`: QA-only PGlite probe, **1 test passed**, reproducing current invalid-reference acceptance. The assertion characterizes a defect; it is not a regression test asserting desired rejection.

No lint/typecheck/build claimed for this read-only source audit. No product source was changed.

## W1 implementation checkpoint

The root subsequently authorized implementation. Product changes are now frozen for integration; no commit, migration, deployment or provider calls were made by this agent.

- `create_task.sourceNoteId` is an optional existing-task-command field shared by web and assistant. The shared task repository locks the account, validates the owned note, and atomically creates a task plus server-owned `note.data.taskId`. Repeating conversion with distinct request IDs returns the original task. Assistant tools expose the source note ID; direct note creation/patch cannot forge a backlink.
- Note content remains intact through conversion, web edits, assistant patches, task start/completion and removal. Task completion cleanup now specifically removes focus records; its previous broad taskId match would have removed linked notes. The integration test caught this interaction before freeze.
- Thought cards show the exact linked task and its completed state. Open task provides a matching starting timer or an explicit reopen action. Links load independently of the 200-task view cap and retain manual presentation/timer metadata. Removed or hard-deleted tasks show an explanation and cannot be silently recreated by conversion.
- New/changed workout programId references must identify the account's own workout_plan, on both save and patch. Unchanged links on historical logs remain editable after the plan is deleted.
- Task category copy explains its icon and activity-suggestion behavior. Grocery labels pluralize cup, slice, clove, can and package without changing stored arithmetic or free-text ingredient names.
- The temporary audit characterization probe/config were removed after desired regression coverage was added to the normal integration suite.

Current validation at freeze:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- Normal `npm run test --` selection of workspace repository integration, task-service, ThoughtsView, life-patch, task-intent-parser, meal-groceries unit/integration, home-model, today-model, workout-plans and FoodViews: **207 tests passed in 11 files**. Provider error log lines in parser tests are mocked failure fixtures; no live API calls were made.

The integration suite exercises simultaneous PGlite submissions and shared-service channel parity; it is not a fresh real PostgreSQL concurrency certification. Signed-in browser/keyboard interaction of the new thought backlink, live model selection of sourceNoteId, real SMS conversion/delivery and phone behavior remain unverified by this agent. Root owns the full integrated check and subsequent UI review.
