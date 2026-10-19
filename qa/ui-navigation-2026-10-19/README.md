# Focused workspace navigation refinement — October 19, 2026

Candidate: `codex/tempo-calm-ui`, based on `eddcafd`. The commit containing this
record is the reviewed change. Local compiled Next.js candidate at port 3101;
fictional Alex preview. No production changes or paid provider calls ($0).

## Decision

Use a full-width screen and a closed-by-default navigation drawer on every
viewport. The top-left Menu stays available while scrolling. Today adds four
small app shortcuts that open the matching drawer group. This keeps navigation
discoverable without reserving a permanent sidebar or requiring a hidden swipe
gesture. Existing section URLs and all account/data actions remain intact.

Compared neutral icons (`02-neutral-today.png`) with restrained color
(`04-restrained-color-today.png`). Chose neutral drawer icons and inactive tabs,
with color for the active destination, agenda type and Today app shortcuts.
Section content retains its existing dominant palette and supporting colors.
Removed colored icon tiles, switched section wayfinding to consistent Lucide
outlines, and aligned headings/cards with Manrope. Fitness now uses a dumbbell,
nutrition a chart, meals utensils and thoughts a notebook.

The color choice is a design judgment, not a demonstrated clinical benefit.

## Observed checks

1. **Today:** full-width desktop and 390 × 844 phone rendering; clear date,
   agenda, routine/To-do switch, launcher and composer. A preview routine check
   changed 2/4 to 3/4 with the correct next step and an honest preview notice.
2. **Drawer:** closed initially; opens on desktop and mobile; background is
   inert and scrolling locks. Tab/Shift+Tab wrap, arrow keys and Home/End navigate
   children, Escape closes and restores the actual opener (including a Today
   shortcut). Selecting a destination closes the drawer and focuses the main
   content. Account/settings, Guide and sign-out retain their existing paths.
3. **All grouped destinations:** compiled-build UI navigation reached To-do,
   Calendar, Goals, Reminders, Routines, Sunrise & sunset, Meal plan, Recipes,
   Groceries, Nutrition Tracker, Fitness, Thoughts and Memories. Each had the
   expected heading/focus and no horizontal document overflow. Raw observations
   are in `navigation-smoke.json`. Also reached Settings and Ask Tempo.
4. **Responsive selection:** resize from desktop to phone keeps Nutrition
   Tracker's selected tab fully visible. Inspection found a one-pixel vertical
   overflow from the underline; corrected the mobile strip's overflow/padding.
5. **Compiled styling:** inspected Goals, Nutrition, Today and drawer; checked
   phone Today/Goals/Nutrition and drawer. No warning/error browser logs were
   observed in the final compiled preview check.

## Validation

- `npm run check`: passed (106 test files passed, 2 skipped; 810 tests passed,
  3 skipped). Includes lint, typecheck, Next production build and ops build.
- After the final font, focus-restoration and responsive refinements, lint,
  typecheck and production/ops build passed again. Last mobile scrollbar/toast
  adjustment was CSS-only and received another successful production build.
- No new implementation-mirroring tests were added; navigation interactions
  were exercised in the browser and existing domain regression tests ran.

## Limits

This is a navigation/visual pass, not a new whole-product readiness rating.
Preview interactions do not prove persistence, SMS delivery or Google Calendar.
Existing release gates for real candidate integrations remain open. No new
personal/customer records were edited. Hardware and physical touch interaction
were not tested. Screen reader output and OS reduced-motion rendering were not
audited; reduced-motion rules remain in code. Mouse hover intent is implemented
but the available browser control did not provide a hover action for a direct
interaction check. Click and keyboard routes were verified.
