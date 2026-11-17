# Mobile workspace review — November 16, 2026

Candidate: `codex/mobile-experience`, reviewed application commit `6ee6314`,
test-fixture correction and full-check commit `27f8d94`.
Baseline: production/main `0436d63` (PR32). Local preview: port 3104.

## Scope and outcome

The phone workspace now has Today, To-do, Calendar and Spaces in a fixed bottom
bar. Ask Tempo is optional inside Spaces; the persistent desktop composer and
footer shortcut are hidden on phones. Desktop layouts are retained above 760px.

Today has a compact current-activity card and an early next-calendar-event row.
Search is available from a header button. Banner settings remain in Customize.
Phone food entry uses a full-height sheet with pinned Save/Cancel, optional
macronutrient details, and visual-viewport sizing. Calendar uses compact date
controls and drops its redundant introductory heading on phones. A successful
task create offers View task, which explicitly reveals and focuses the saved row.
Unknown, truncated or ambiguous task refreshes do not guess an ID.

The review found and corrected three problems: the new task was hard to find,
the paused timer covered the chat editor, and a fixed minimum transcript height
clipped Send after a long draft lost focus. The final chat checks covered focused
and blurred drafts, clearing the draft, and leaving chat with a paused timer.

## Independent review

| Journey | Customer score | Observed evidence |
| --- | ---: | --- |
| Today | 8.5 | Morning action and next event at 390px; current action at 320px. |
| Navigation | 9 | Bottom shortcuts, grouped Spaces, destination focus, optional Ask. |
| Add/find a task | 8.5 | New undated task revealed; Done filter resets to All on explicit View task. |
| Focus | 9 | Start, pause, dock, reopen, resume, complete; completed row verified. |
| Calendar | 8 | Date changes update agenda; four Planner labels fit; first row starts above navigation at 320px. |
| Food entry | 9 | Fictional 185 kcal item saved, total changed 360→545, unknown macros stayed unknown. |
| Optional Ask | 8 | Long draft and Send remain usable focused/blurred at 320/390px; no message sent. |
| Guide | 8.5 | All eight preview steps traversed; mobile Spaces spotlight and optional-chat copy. |

Customer overall: **8.6/10**, compared with 6.5 in the prior baseline audit.
Professional design review: **8.4/10** on `dffe99a`, before the final Calendar
heading reduction. The designer personally exercised the initial candidate
(7.6/10), then reviewed final source, customer captures and lead comparisons.
Their browser session was unavailable for the second interactive pass. The
customer personally tested the final task/chat/food flows; the last Calendar
score uses their independent inspection of lead-captured evidence at `6ee6314`.
These are simulated reviews, not research with actual neurodivergent customers.

Secondary screens spot-checked at 390px: Groceries, Meals, Fitness, Routines,
Goals, Thoughts, Settings and Journey. No horizontal document overflow was
observed. Primary controls measured 46–48px in the seven workspace tools.
This was a layout/navigation check, not full workflow validation for those tools.

## Evidence

- [Today, 390px](today-390.jpg)
- [Saved task, 320px](saved-task-320.jpg)
- [Pinned food Save/Cancel, 320px](food-entry-320.jpg)
- [Optional chat with a blurred draft, 320px](optional-chat-320.jpg)
- [Compact Calendar, 320px](calendar-320.jpg)
- Desktop Today: [candidate](desktop-today-candidate.jpg), [production](desktop-today-production.jpg)
- Desktop food: [candidate](desktop-food-candidate.jpg), [production](desktop-food-production.jpg)
- Desktop Calendar: [candidate](desktop-calendar-candidate.jpg), [production](desktop-calendar-production.jpg)

Desktop comparisons used 1280×900 CSS viewports. Today and Calendar retain their
layout and controls. Food retains its two-column fields and expanded nutrients;
the candidate also locks background scrolling and focuses Food name on desktop.

## Validation and release boundary

Targeted model, date, calendar, task confirmation, planner and tour tests passed.
Typecheck and source lint passed. The original worktree's normal `npm run check`
stopped at seven pre-existing lint errors in untracked
`output/account-reset-approved.cjs`; that file was not modified. Full check is
completed successfully from `27f8d94` in a clean detached checkout:

- `npm run check`: exit 0 — lint, typecheck, tests, production build, operations build.
- 177 test files passed; 3 skipped. **1,466 tests passed; 12 skipped.**
- The skipped cases require a separately configured real PostgreSQL fixture.
- The first clean run exposed two ownership fixtures missing `tasks: []` from
  their mock workspace response. The fixtures were completed; the original
  ownership assertions remain unchanged. The full suite was then rerun.
- [Full successful check log](full-check.log). Provider errors in this log are
  intentional failure-path fixtures, not failed live provider requests.

All browser interactions used the fictional Alex preview. No paid model calls,
SMS deliveries, real Calendar writes or customer records were involved. No API,
database schema, authorization policy or worker behavior changed. The client
still uses the same account-scoped mutation and refresh path.

Remaining checks: physical iPhone Safari keyboard/address-bar behavior,
Add to Home Screen, VoiceOver and touch ergonomics. Safe-area/visual-viewport
code is present but those device behaviors are not verified by desktop viewport
emulation. At 320px, long task titles and the Calendar agenda need scrolling;
a long chat draft leaves little transcript visible. Food & fitness's secondary
tabs scroll horizontally, with every destination also available in Spaces.

Pushed as [PR33](https://github.com/chancendahmer/Tempo/pull/33), ready for review.
No merge or production deployment occurred in this task. Rollback, if released, is a
code revert to `0436d63`; this change has no migrations or data conversion.
