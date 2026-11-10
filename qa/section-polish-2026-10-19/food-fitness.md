# Food and fitness section polish — 2026-10-19

## Evidence

Inspected Tempo's live local preview in a dedicated background in-app browser tab at `http://localhost:3101/workspace/preview`. Used the existing browser viewport without changing it. Saved full-page before/after screenshots for Nutrition, Meal plan, Recipes, and Fitness; also saved Groceries after. These show fictional preview records, not a connected user's account.

Public primary references inspected without signing in:

- [MyFitnessPal: Your Today tab](https://support.myfitnesspal.com/hc/en-us/articles/39985611667341-Your-Today-tab), including its [official calorie/macro screenshot](https://support.myfitnesspal.com/hc/article_attachments/45332043194253). Supports compact daily totals above a diary grouped by meal and meal-specific logging actions.
- [Paprika 3 Windows guide](https://www.paprikaapp.com/help/windows/), including its [official recipe-library screenshot](https://www.paprikaapp.com/static/images/help/windows/recipes.png). Supports searchable image cards with recipe metadata, separate meals/groceries/pantry, and clear recipe actions. The guide identifies itself as version 3 and links a separate version 4 beta; this is not a claim about the beta UI.
- [Mealime public product page](https://www.mealime.com/), including its [official meal picker image](https://www.mealime.com/images/app-screens/pick-your-meals.png). Used the image grid and simple plan/shop/cook sequence as historical product references. The public site announces an October 21, 2026 shutdown; no availability recommendation is implied.
- [Hevy routine guide](https://www.hevyapp.com/features/gym-routines/), including its [official routine screenshot](https://www.hevyapp.com/wp-content/uploads/hevy-create-routine-1-1024x683.png). Supports keeping reusable plans separate from completed logs, compact exercise rows, and visible session actions.
- [Strong public product page](https://www.strong.app/). Read its planning/logging presentation. Its linked official phone image failed in the web reader, so no claim of inspecting that screenshot or an authenticated session.

## Changes

- Nutrition: compact calorie and macro cards side by side on wide screens; stacked at smaller widths. Kept diary-first hierarchy, optional user targets, estimates/unknown/partial labels, and all existing actions. Added meal-specific icons, entry counts, and meal macro totals computed with the existing nutrition model. Unknown nutrients stay unknown.
- Recipes: three image cards across on wide screens, two on intermediate screens, one on small screens; shorter image framing retains illustration captions. Search now matches recipe names and recorded ingredients, announces matching counts, and has clear/reset and no-results recovery actions. Added compact prep/serving metadata and only labels actual favorites. Ingredients and preparation retain disclosure controls with clearer internal headings.
- Meals: explicit meal group headings and counts, planned counts on each day, shorter meal images. Existing shopping toggles, portion disclosures, recipe swap restrictions, and callbacks retained.
- Groceries: actual remaining/purchased counts added. Purchase state remains separate from pantry stock.
- Fitness: compact completed-session rows with date, activity, time, edit/delete actions, and optional note disclosure. Added actual selected-day session counts, actionable empty history, and visible selected-template/view-session labels. Existing plan customization, schedule editor, and completed-log editor retained.

No server/domain/provider changes, no global stylesheet or Today changes, no external calls through paid models, and no production writes.

## Validation

- `npm run test -- src/app/workspace/FoodViews.test.ts src/app/workspace/NutritionView.test.ts src/app/workspace/nutrition-model.test.ts src/app/workspace/workout-plans.test.ts`: 4 files, 21 tests passed.
- Added nutrition rendering regression coverage for selected-date filtering, partial meal totals, and unknown nutrients without invented zero or remaining values.
- `npm run lint`: passed after changes, including the added test.
- `npm run typecheck`: passed after the UI edits. Rerun after adding the test found a concurrent edit error in `ThoughtsView.tsx(20,113)` (`body` union narrowing), outside this agent's ownership. Root agent notified; no owned-file diagnostics.
- `git diff --check` on owned UI/CSS paths: passed; only normal LF/CRLF warnings.
- CUA preview checks: ingredient search `broccoli` returned 1 of 4 recipes; unmatched query displayed recovery and Show all restored all 4. A Lunch food entry with blank nutrients saved with unknown/partial labels. A workout template customized and saved successfully; Schedule opened a prefilled task editor (cancelled); Log completed saved a manually entered 12-minute preview session. Reload cleared the test records.
- Saved screenshots: `nutrition-before.jpg`, `nutrition-after.jpg`, `meals-before.jpg`, `meals-after.jpg`, `recipes-before.jpg`, `recipes-after.jpg`, `fitness-before.jpg`, `fitness-after.jpg`, `groceries-after.jpg`.

## Limits

No authenticated competitor UI, real-account persistence, live provider calls, barcode hardware, production deployment, or build was exercised here. Responsive CSS was implemented but the shared browser viewport was deliberately left unchanged; root agent can verify narrow sizes in its independent final QA. All mutation testing above used the explicitly fictional, resettable local preview.

## Review follow-up

- Nutrition search, manual entry, per-meal entry, and edit-entry controls retain their actual opener and restore it after the entire food-entry flow closes. A search-to-manual transition retains the search opener and avoids restoring focus while the manual dialog is open. If an edited entry moves off the selected date, the persistent Manual entry control is the fallback.
- Fitness plan/log dialogs now restore their opener on closing or saving, with the persistent Log completed movement control as fallback.
- Added a visible top Save plan button to `WorkoutPlanEditor.tsx`, associated with the existing validated form via a generated ID. It uses the same pending/saving/conflict guards; customization and bottom actions remain available. Header actions wrap at narrow widths.
- Follow-up validation: same 21 tests passed; lint passed; typecheck passed after the concurrent ThoughtsView issue was resolved.
- Follow-up browser validation was attempted but unavailable: the previous in-app browser (`iab`, selected ID `2`) returned “Browser is not available” for both opening a tab and tab inventory. Root agent notified to verify focus using the review browser; no unsupported browser fallback used.
