# Tempo family redesign — design QA

15 October 2026 · candidate `codex/tempo-calm-ui`, based on `98e61bf`.

**Result: desktop visual pass; responsive and release validation incomplete.**

This checkpoint implements the competitor research direction. It does not approve merging or deployment. The [previous Today QA](docs/design-research/2026-10-15/prior-today-design-qa.md) and [release checkpoint](docs/UI_RELEASE_CHECKPOINT.md) remain separate evidence.

## Source comparison

The [user nutrition reference](qa/design-research-2026-10-15/user-nutrition-reference.png), [before](qa/design-research-2026-10-15/tempo-nutrition-before.jpg), and [after](qa/design-research-2026-10-15/tempo-nutrition-target-example.jpg) were opened together for visual comparison. This adapts the reference's hierarchy rather than claiming pixel accuracy: date strip, calorie summary, three macro summaries, then meals. Desktop retains Tempo's sidebar, account identity, related subtabs and assistant composer. Typeface, colors and assets are Tempo's own.

The reference is a narrow mobile image; implementation captures use a normal 1625px desktop viewport with 1610px document content after scrollbar. Matching mobile dimensions were not successfully established. Requested 390px viewport overrides were ignored; an iframe harness was blocked by the existing frame protection and removed. No security protection was disabled. Mobile, 200% zoom and assistive-technology verification remain open.

## Implemented visual direction

- Planner: warm working paper, ruled To-do rows and time-aligned Calendar. Illustrated Goals retained.
- Daily rhythm: honey canvas, morning/evening columns, next step before checklist. Existing wake behavior retained.
- Food & fitness: ice-blue canvas, white rounded cards, sans-serif headings, quantitative Nutrition Tracker, recipe search, shopping beside recorded pantry, selected workout before templates.
- Brain dump: violet structure, paper notes, separate saved facts, conversation before optional suggestions.

Distinct subtab colors remain intentional. Shared family typography, borders, corner treatment and canvas establish grouping without making every screen identical.

## Repairs and observations

Corrected inherited green macro bars, empty meal-card stretching, checked-box icons on unfinished Calendar tasks, and small Planner metadata. Calendar row spacing was reduced. Nutrition unknown/partial/zero targets have regression coverage; no default intake target was invented.

In the fictional preview, the root reviewer entered optional test targets (360 logged / 2,000 target = 1,640 remaining), searched and cleared recipes, completed a To-do, changed Calendar day, opened its edit explanation, and completed a routine step with correct progress and Undo. These are observed preview controls, not persisted account or provider evidence.

## Independent review

GPT-6.1 Sol reviewers inspected areas they did not implement, using the saved screenshots. After corrections: To-do 8/10, Calendar 8/10, Food suite 8/10 as a group, Routines 8.5/10, Thoughts 8/10, Memories 8.5/10, Ask Tempo 8.5/10. These are desktop visual scores only. There is no new overall beta score or individual score for unchanged Today, Goals, wake or onboarding.

Minor follow-ups: clearer note expansion, less repeated introductory copy, measured secondary-text contrast and icon-target review. See the [implementation review](docs/design-research/2026-10-15/09-implementation-review.md) for captures, outcomes and limitations.

## Technical validation

Final `npm run check`: exit 0. Lint, typecheck, 805 tests passed / 3 skipped (106 passed / 2 skipped files), production Next build and operations TypeScript build passed. `git diff --check` passed. No paid API calls ($0), live SMS/Calendar operations, customer-account mutations or hardware tests occurred in this pass.

No migrations, provider contracts, write authorization or database ownership logic changed. Assistant navigation wording follows the new Nutrition Tracker label. Real-account persistence, cross-channel regression, mobile/keyboard/contrast checks and the remaining release gates must pass before merge.

## Deliverables

- [Visual research gallery](qa/design-research-2026-10-15/index.html)
- [Master direction and copyable briefs](docs/design-research/2026-10-15/00-direction-and-agent-briefs.md)
- Eight subsection research reports plus the implementation review.
- Local candidate preview: http://localhost:3101/workspace/preview

Rebuild the self-contained gallery with `python docs/design-research/2026-10-15/build-gallery.py`. Screenshots of competitors are research references, not application assets.
