# Today overdue clarity correction

The customer reviewer observed an unfinished October 15 task foregrounded in
October 18's NOW row with its old date but no explicit overdue label.

`TodayView.tsx` now prefixes the task's due metadata with `Overdue ·` when its
account-local due day precedes the current account-local day. The same metadata
appears in the Today To-do checklist. This uses the existing due-day semantics
from Planning/Today. Date-only deadlines represented as local 23:59 remain
current through local midnight, including the final seconds of that day.

Task selection, timer controls and persisted focus status, routine selection,
and Calendar precedence were not changed. No palette/style change was made.

Read the installed Next `use-client` guide before editing. Three rendered
regression cases in `today-model.test.ts` cover the stale task in NOW/checklist,
New York's local end-of-day boundary despite UTC already being the next day,
and future started work / paused focus remaining distinct from overdue task
metadata. Existing Calendar and due-label tests were included.

`npm run test -- src/app/workspace/today-model.test.ts src/app/workspace/today-calendar.test.ts src/app/workspace/task-due-label.test.ts`:
**3 files / 20 tests passed**, exit 0. Evidence:
`today-overdue-tests-final.log`. The initial log retains one failed test whose
asserted 25-minute start label disagreed with the existing 15-minute fixture;
the assertion was corrected to check preservation of the fixture's duration.
It was not a product failure.

`npm run lint` and `npm run typecheck` both passed, exit 0, without diagnostics.
Evidence: `today-overdue-lint.log`, `today-overdue-typecheck.log`. Targeted
`git diff --check` passed. Browser confirmation belongs to root's independent
customer walkthrough. The server was not restarted for this change.
