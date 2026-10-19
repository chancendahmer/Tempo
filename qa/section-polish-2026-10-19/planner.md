# Planner polish — 2026-10-19

Scope: `PlanningViews.tsx`, `CalendarView.tsx`, their CSS modules, and `planner-views.test.ts`. Today, workspace navigation, persistence, provider calls, and illustrated Goal cards were preserved.

## Sources and decisions

- [Todoist: Get started](https://www.todoist.com/help/todoist/get-started/get-started-with-todoist-OgNNJR): clear sections, small steps, and accessible completed work. Retained Tempo’s date groups and added a quiet completed-count shortcut to Done.
- [Things: date-based lists](https://culturedcode.com/things/support/articles/4001304/), including its official [Today screenshot](https://culturedcode.com/frozen/2025/10/dates-today.jpg) and [Upcoming screenshot](https://culturedcode.com/frozen/2026/08/dates-upcoming.jpg): dates and project context make a list easier to scan. Replaced generic “Goal step” metadata with the actual goal title and added group estimates only when every task has a known estimate.
- [Motion: tasks versus events](https://www.usemotion.com/help/project-management/task/reference-tasks/the-difference-between-tasks-and-events-in-motion): preserve a visible distinction between work items and appointments. Added source counts and separate blue event / amber reminder rails; kept tasks as editable checklist rows. No automatic scheduling was added.
- [Fantastical: calendar views](https://flexibits.com/fantastical/help/calendar-views): quick date navigation combined with an agenda summary. Made the week strip stable Monday–Sunday instead of recentering on every selected day; today has a separate dot and `aria-current="date"`.

These are focused adaptations to Tempo’s existing warm palette, quiet borders, line icons, and sheet layout, rather than copies of another product.

## Observed before → after

1. **To-do list — healthy, clearer context.** Existing date grouping worked. Completed work was hidden behind a tab and every linked task said only “Goal step.” The list now surfaces completed count, linked goal names, and known group workload. `planner-tasks-before.jpg` → `planner-tasks-after.jpg`.
2. **Calendar — navigation and scan improvements.** The selected day was always centered, shifting every weekday after a click. The strip now keeps the same week when choosing Mon → Tue. The day summary distinguishes event/task/reminder counts. Event and reminder rows have different colored rails. `planner-calendar-before.jpg` → `planner-calendar-after.jpg`; mixed Tuesday example in `planner-calendar-mixed-after.jpg`.
3. **Empty calendar — actionable and aligned.** Sunday’s empty state now offers “Plan something small.” Its existing icon was visibly left-aligned while the copy was centered; fixed and recaptured. `planner-calendar-empty-after.jpg`.
4. **Goals — preserved.** Confirmed the landscape artwork, progress bars, next step panels, and edit/add-step controls still render. `planner-goals-preserved.jpg`.

Additional correctness fixes: abandoned tasks do not appear in the agenda; an unknown task duration is no longer invented as 25 minutes; completed tasks are struck through and in-progress tasks labeled. Calendar errors offer Retry or Reconnect while retaining saved tasks and reminders.

## Actions verified in the preview

- Opened Planner from Today, then To-do, Calendar, and Goals in an agent-owned background IAB tab at `http://localhost:3101/workspace/preview`.
- Selected “2 completed”; Done displayed the two completed tasks and Reopen controls. Returned to All.
- Selected Monday → Tuesday → Sunday. The week stayed October 19–25; Tuesday showed 1 event, 1 to-do, and 2 reminders.
- Selected “Plan something small” on Sunday. Ask Tempo opened with `Help me schedule an event on 2026-10-25.` prefilled. Did not send the message. Cleared the draft afterward.
- Inspected and saved screenshots at the normal desktop viewport. Did not change the shared viewport, connect a provider, or touch real account data.

## Validation and limits

- `npm run test -- src/app/workspace/planner-views.test.ts src/app/workspace/calendar-events.test.ts src/app/workspace/calendar-connection-view.test.ts`: **3 files, 14 tests passed**.
- `npm run lint`: **passed**.
- `npm run typecheck`: **passed**.
- `git diff --check`: **passed**, with ordinary CRLF conversion warnings.
- Five new rendering tests cover goal context/completed count, incomplete estimates, week boundaries/current date, abandoned tasks/unknown durations, and saved tasks during an event error.
- Error/reconnect behavior was covered by rendering tests; no live provider failure was induced. No live AI call, production mutation, or persistence round-trip was tested. Desktop screenshots are visual evidence; mobile and full accessibility review remain part of integrated QA. Root agent owns the cross-cutting build/check.
