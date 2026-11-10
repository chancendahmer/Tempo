# Independent section usability review — 2026-10-19

Reviewer: independent review agent, separate from implementation author. This is an expert heuristic review from the perspective of a neurodivergent novice, not a study with recruited customers.

Scope: Tempo synthetic preview at `http://localhost:3101/workspace/preview`, candidate work over `2a36936`. Desktop viewport 1280 × 720 (content screenshots approximately 1265 px wide after scrollbar). Today was already approved and is excluded from the score. No live models, SMS/provider calls, real account changes, or external writes were used. All edits below were disposable in-memory preview edits. Preview states explicitly say they reset on reload.

## Verdict

**8.2 / 10 for the scoped section UI after the second pass** (initial pass 8.0). The new screens have recognizable jobs and retain a coherent family: task list, agenda, recipe library, food diary, workout log and notebook. Plain headings, concrete next actions, optional personalization and honest sample labels work well. The author repaired the two P2 issues and this reviewer independently confirmed them in the running UI. Remaining opportunities are small copy issues and reducing manual work between shopping and pantry. This score is not production readiness or a live assistant behavior score.

Scale: 5 = task possible with substantial guessing; 7 = usable with repeated friction; 8 = clear with localized friction; 9 = unusually effortless and robust. No score assumes that an untested live path works.

## Steps and per-section scores

| Step | Section | Score | Health and observed interaction | Evidence |
|---|---|---:|---|---|
| 1 | To-do | 8.4 | Healthy. All/Today/Next 7 days/Done and grouped tasks give clear structure. Empty Save invokes native required-field validation. Added synthetic “Review demo checklist”; open count rose from 7 to 8 and item appeared under No date yet. | [01](01-todo.png) |
| 2 | Goals | 8.3 | Healthy after context fix. Progress and next small step are clear. Add a step initially omitted the goal name; rechecked author fix and confirmed explicit goal context. | [02](02-goals.png), [18](18-goal-context-fixed.png) |
| 3 | Calendar | 8.1 | Healthy. Selected Tuesday and date/agenda changed together, showing event, task and two reminders. Readable agenda identity. External calendar connection remains synthetic. | [03](03-calendar.png) |
| 4 | Reminders | 7.7 | Clear saved list and search. New reminder opens Ask Tempo with “Remind me to” prefilled. Preview discloses the lack of live AI; actual reminder creation cannot be completed here. | [04](04-reminders.png), [05](05-ask-tempo.png) |
| 5 | Routines | 8.6 | Healthy. Completed Breakfast step: progress changed 2/4 → 3/4, next action changed to Choose one thing for today, Undo appeared. Strong morning/evening separation and familiar checklist. | [06](06-routines.png) |
| 6 | Sunrise & sunset | 8.3 | Healthy. Started Try 20 seconds, saw countdown and End session, then exited. Current-screen and usual-alarm limitations are clearly stated. No sudden audio was triggered by the default. | [07](07-sunrise.png) |
| 7 | Meal plan | 8.3 | Healthy. Week and meal slots are recognizable; existing meal cards show portions, ingredients and swaps. Plan a meal opens date/meal/ingredients form. Note distinguishes planning from logging eaten food. Minor copy mismatch: new-meal editor says “dinner indecision” while default Meal is Breakfast. | [08](08-meal-plan.png) |
| 8 | Recipes | 8.5 | Healthy. Search, image cards, prep time and expandable preparation make a recognizable library. Expanded yogurt preparation and opened Plan a meal: recipe/servings context carried through. | [09](09-recipes.png) |
| 9 | Groceries / pantry | 8.0 | Healthy, with manual duplication. Added “Demo apples”, amount 3; pantry displayed “3 Demo apples”. Purchase and pantry distinction is explicit. Moving purchased items into stock requires re-entry instead of a direct handoff. | [10](10-groceries.png) |
| 10 | Nutrition Tracker | 8.3 | Strong diary identity. Lunch Log food opens a manual form already set to Lunch. Saved “Demo apple”, 95 kcal, unknown macros: daily total 360 → 455 and macros show partial/unknown rather than zero. Recent foods includes new apple. Second pass confirms food-search close and manual-save restore opener focus. External search/barcode not called. | [11](11-nutrition.png), [12](12-food-finder.png), [19](19-food-focus-fixed.png) |
| 11 | Fitness | 8.1 | Healthy after repair. Saved Full-body foundations; new saved plan card appears and Log completed pre-fills plan/session/minutes. Scheduling vs completion distinction is clear. Second pass confirms visible top Save plan accepts defaults immediately, returns focus to Make this my plan; movement-log Cancel returns focus to Log completed. Long detailed customization remains optional work. | [13](13-fitness.png), [14](14-plan-editor.png), [20](20-plan-quick-save-fixed.png) |
| 12 | Thoughts | 8.6 | Healthy notebook. Note titles/body are easy to scan. Add to To-do pre-fills note title and the original note remains. Cancel restores focus to its opener. | [15](15-thoughts.png) |
| 13 | Memories | 7.8 | Clear facts/preferences identity, plain explanation and correction controls. Add a memory routes to Ask Tempo with “Remember this about me:” prefilled. Actual AI-assisted memory creation/correction is unverified. | [16](16-memories.png) |
| 14 | Ask Tempo | 7.8 | Clear chat identity and honest scripted labels. Submitted a synthetic request; visible message says preview does not call AI or send messages. Input remains intact. Live assistant usability cannot be rated from this. | [05](05-ask-tempo.png) |
| 15 | Settings | 8.1 | Healthy personalization. Completed name → tone → streak choices; returned to Personalize Tempo with explicit preview success. Quiet hours is easy to locate. Operational worker wording is a small clarity defect. | [17](17-settings.png) |

## Defects and recommendations

**Second-pass status:** findings 1 and 2 below are CLOSED. Food search Close now restores Find a food / scan; a newly saved lunch food restores Add food to lunch; top Save plan successfully saves defaults and restores Make this my plan; movement-log Cancel restores Log completed. Confirmed through fresh AX snapshots and read-only `document.activeElement` checks. Screenshot 19 shows saved food; screenshot 20 shows the new top action. Initial reproduction notes are retained below as the review trail.

1. **P2 — custom food and workout dialogs lose keyboard focus on close/save.** Reproduction: Nutrition Tracker → Find a food / scan → Close food search. The fresh accessibility tree reports focused element as AXWebArea/document, rather than Find a food / scan. Saving manual food has the same result. Fitness → Make this my plan → Save my plan and saved-plan Log completed → Cancel also return focus to document. A keyboard user loses position on a long page. Restore the triggering control or an intentional newly created result. Generic task dialogs and personalization already restore focus correctly; use that same behavior. Screenshot 12/14 shows affected dialog family; focus evidence is from fresh AX observations.

2. **P2 — accepting a workout template opens too much editing before the user can accept defaults.** Reproduction: Fitness → Full-body foundations → Make this my plan. Both sessions, ten movements, sets/reps, alternatives and removal controls are expanded. Save my plan is below all rows, several scrolls from the top. This asks a novice to process every detail before a simple acceptance action. Put a clear default acceptance action near the top or in a sticky footer; let detailed editing be optional. Evidence: screenshot 14 and observed 152-element dialog tree. Adoption did succeed, so this is usability friction rather than a broken operation.

3. **P3 — Settings uses implementation language without a useful user action.** Reproduction: Settings → Quiet hours & delivery. Copy says, “Actual outreach also depends on the configured worker and sending controls.” A novice cannot act on “worker”. Replace with a plain delivery status or user-relevant explanation. Fresh AX evidence; screenshot 17 is collapsed entry state.

4. **P3 opportunity — purchased groceries require manual pantry re-entry.** Shopping help says to add separately. This is honest, but it increases remembering and typing for the exact audience. Consider an explicit Add to pantry action on purchased items, with confirmation of amount. Do not silently mark stock or eaten food. Evidence: screenshot 10 and successful separate stock form interaction.

5. **P3 copy — meal editor heading assumes Dinner while default slot is Breakfast.** Reproduction: Meal plan → Plan a meal. Heading “A little less dinner indecision”, default Meal “Breakfast”. Use neutral meal wording or selected-slot copy. Form itself is usable.

**Closed during review:** Goals → Add a step initially had generic task copy and no linked-goal context. Rechecked after author update: title now One small step and text “For your goal: Finish my design project.” Screenshot 18 confirms the fix. Goal score reflects the repaired state.

Final Settings recheck: the worker wording in finding 3 remained visible on this independent review tab at recheck. Screenshot 21 captures the expanded state. Parent is handling that copy repair separately.

## Accessibility and evidence limits

Visible icon controls generally have descriptive accessibility names, headings follow a useful hierarchy, dialogs take initial focus, native required validation works, and preview status messages explain state changes. These are confirmed strengths, not a WCAG compliance claim. Contrast ratios, complete keyboard traversal/focus trapping, screen reader announcement timing, reduced motion and zoom resilience were not fully tested. Font/secondary text is relatively light and should be measured before claiming accessible contrast.

Desktop screenshot files 01–18 were captured during this run, saved locally, then opened/inspected before acceptance. Screenshot 12 is the manual food editor despite its filename; it is not a food search result. No old screenshots were used. Mobile is being checked separately by the parent agent and is not included in this independent desktop score. PostgreSQL persistence, real authentication, configured provider calls, AI-generated responses, live nutrition search/barcode, Google Calendar synchronization, SMS consent/delivery gates and production deployment were not validated. This audit does not replace repository tests.

## Screenshots in review order

![1. To-do](01-todo.png)
![2. Goals](02-goals.png)
![3. Calendar](03-calendar.png)
![4. Reminders](04-reminders.png)
![5. Ask Tempo with prefilled reminder](05-ask-tempo.png)
![6. Routines](06-routines.png)
![7. Sunrise and sunset](07-sunrise.png)
![8. Meal plan](08-meal-plan.png)
![9. Recipes](09-recipes.png)
![10. Groceries and pantry](10-groceries.png)
![11. Nutrition diary](11-nutrition.png)
![12. Manual food editor](12-food-finder.png)
![13. Fitness](13-fitness.png)
![14. Workout plan editor](14-plan-editor.png)
![15. Thoughts](15-thoughts.png)
![16. Memories](16-memories.png)
![17. Settings](17-settings.png)
![18. Goal context fix](18-goal-context-fixed.png)
![19. Food save with restored opener focus](19-food-focus-fixed.png)
![20. Workout plan immediate save action](20-plan-quick-save-fixed.png)
![21. Settings expanded copy before parent repair](21-settings-copy-recheck.png)
