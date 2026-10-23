# Goal completion and overdue reminder clarity

Reviewer findings were verified in the current source before editing.

- `PlanningViews.tsx`, GoalsView only: an active goal whose linked steps are all
  completed now exposes **Mark achieved** directly in the card before the
  closed options disclosure. **Add a step** stays available. Other active goals
  retain the completion action in options. The direct action uses the existing
  callback and saving guard; there are no goal-state or backend changes.
- `SavedContextViews.tsx`, reminder display: scheduled reminders with a timestamp
  earlier than the current instant show **Overdue · scheduled**. The stored
  status remains unchanged, and the displayed date/time retains the account
  timezone. Upcoming and exact-now reminders remain scheduled; sending and sent
  records retain their own status, and sending controls stay disabled. Header
  copy now includes overdue reminders. Optional `now` injection permits stable
  boundary tests without changing the existing caller.
- `SavedContextViews.test.ts`: added rendered regressions for visible direct
  completion, saving/unfinished-goal cases, account-timezone reminder formatting,
  overdue versus future/exact-now reminders, and sending/delivered distinctions.

Nearest test run: **1 file / 4 tests passed**, exit 0; log
`goals-reminders-tests.log`. Lint passed, exit 0, no diagnostics; log
`goals-reminders-lint.log`. Typecheck passed, exit 0, no diagnostics; log
`goals-reminders-typecheck.log`. Targeted `git diff --check` passed.

No CSS/palette, delivery behavior, database code or provider configuration was
changed. The existing candidate server was not restarted. Root owns independent
browser confirmation and any required final release validation.
