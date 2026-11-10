# Tempo: four families, different jobs

Research and first implementation pass · 15 October 2026 · candidate branch `codex/tempo-calm-ui`.

## Design decision

Keep one familiar navigation system, but make the work area match the job. Different background colors alone do not solve the repetition. Lists should read like lists, nutrition like a diary, routines like a sequence, and thoughts like notes.

| Family | Foundation | Composition | Accent roles |
| --- | --- | --- | --- |
| Planner | Warm paper `#faf8f2` | Ruled To-do sheet; aligned Calendar time rows; illustrated goal cards | Blue calendar structure, orange actions, sage goals |
| Daily rhythm | Honey cream `#fff8ec` | Morning/evening columns; next step before checklist; immersive wake controls | Amber daytime, muted violet evening, green completed steps |
| Food & fitness | Ice blue `#f1f7fc`, white rounded cards | Numerical diary; recipe photo grid; shopping list beside pantry; selected workout before library | Blue actions; teal, purple and gold macros; related subtab colors |
| Brain dump | Pale violet `#f6f3fc` | Capture first, then paper notes; searchable saved facts | Violet structure, warm paper content, concise type labels |

Today keeps the approved warm timeline. Ask Tempo remains directly accessible, with conversation taking priority over suggestions. Main groups retain the existing hover/click/touch/keyboard flyouts.

## Evidence, without overclaiming

Eight reports cover Today/To-do; Calendar/Goals/Reminders; Routines/Wake; Nutrition; Meals/Recipes/Groceries; Fitness; Brain dump/Assistant; and Onboarding/Settings. Each includes source links, screenshots, limitations, implementation paths and acceptance criteria.

The strongest direct competitor interaction was Eat This Much's anonymous generator, which returned a sample meal plan. Muse's public entry/download chooser was exercised. MyFitnessPal, Motion, Tiimo and Todoist authenticated workflows were not available. Their official guides and published product screens support visual decisions, not claims about tested persistence. Paprika and Hevy were studied through official product/help illustrations. No competitor account was created or modified.

The user could not sign in to MyFitnessPal and requested public research instead. Its official Today guide and the user's supplied screenshot anchor the nutrition direction. Tempo uses its own components, identity and existing assets; competitor screenshots remain research evidence, not production assets.

## What the Sol implementation team changed

- Planner: quieter To-do sheet; Calendar date strip and time/source alignment. Existing illustrated Goals retained.
- Rhythm/Brain: guided Morning/Evening routine cards, next-step action, paper Thoughts, clearer Memories, readable conversation.
- Food: Nutrition Tracker naming, week picker, optional calorie target and remaining value, colored macro cards, meal diary groups; searchable Recipes; separate shopping/pantry; selected workout before templates.
- Shared shell: four family foundations and related subtab treatments. Stable section IDs and account data contracts remain unchanged.

This is an initial visual implementation with local checks. It is not a completed release or a new live-integration certification. Preview interactions reset on reload and do not establish account persistence.

## Next implementation briefs

### 1. Validate the tracker on a real isolated account

Read report 04 and `NutritionView.tsx`, `nutrition-model.ts`, `FoodEntryEditor.tsx`, `NutritionTargetEditor.tsx`. Retain `nutrition` as the deep-link ID. Exercise search/manual/barcode fallbacks, portions, edit/copy/delete, selected dates, optional targets, partial data and reload. Assert actual stored nutrients and ownership; never infer success from the progress bar. Do not invent intake or default calorie targets. Run nearest tests, lint/typecheck and affected browser journeys.

### 2. Finish each family using its own report

Read reports 01–03 and 05–08; assign one owner per component and one shared-shell integrator. Keep Planner list and time hierarchy, Rhythm step sequence, Food numerical/photo hierarchy, and Brain capture hierarchy. Preserve callbacks and confirmation/consent boundaries. Improve empty/loading/error states using real data, not decorative charts. Validate desktop, 390px mobile, keyboard navigation, long text and reduced motion. An author must not be the sole reviewer.

### 3. Complete the release gates separately

Use the existing release checkpoint and live-journey records. Re-test phone sign-in and number correction, same-account SMS/dashboard updates, Google Calendar confirmation, reminder delivery, restart/retry behavior, and isolation. Keep paid calls within the remaining authorized budget. Do not merge because the screenshots look finished. Hardware wake/brightness/background sound remain unverified.

## Research use

Open the local HTML gallery in `qa/design-research-2026-10-15/index.html` for the visual comparison, and the numbered reports for copyable subsection briefs. The gallery generator reads these reports and uses local screenshot files. No third-party runtime or remote script is needed.
