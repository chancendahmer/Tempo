# Daily and weekly rundowns

Available through the shared SMS and workspace-chat conversation handler.

Examples that work without a model call:

- `Daily rundown`
- `Show me my rundown for tomorrow`
- `Weekly rundown for next week`
- `Rundown for 2027-04-01`
- `Weekly rundown for 2027-04-05`

The model can also call `get_rundown` for conversational requests such as
“Can I get my reminders, goals, tasks and calendar for next week?” The tool accepts
only a local start date and 1 or 7 days; account ID and timezone come from the
authenticated conversation. Natural-language model routing requires a working AI
provider. This week means Monday–Sunday; an explicit weekly date starts seven
days on that date. Local midnight boundaries account for daylight saving time.

The result combines the current Google primary-calendar agenda, pending reminders
(including projected recurring occurrences), open tasks due in the range,
overdue tasks, undated tasks and ongoing goals. Undated tasks and goals are
explicitly separate from scheduled commitments. Each section shows up to 12
items and discloses omitted items. Calendar pagination and the 100-series
reminder limit are disclosed. Failed sources are labeled unavailable; they are
never described as an empty schedule, and other sections remain usable.

This is an on-demand, read-only view of the current plan, not a historical report
of delivered reminders, completed work or calendar edits. It does not enable
proactive messages or recurring digest delivery. Calendar access still requires
the user's existing Google connection. The existing app sections remain usable;
this change does not add a new dashboard page.

Validation includes timezone/DST boundaries, recurring reminders, date filtering,
partial integration failures, model tool parsing, and the shared SMS/web path
with real temporary database repositories. The latter verifies account isolation,
cancelled-reminder exclusion, no product-state writes and ingress replay safety.
Model and Google Calendar responses in these tests are fixtures, not live evidence.
