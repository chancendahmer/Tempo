# W2 reminder clarity — 2026-10-22

Implemented in the managed `tempo-adaptive-home` worktree, without commits, production changes, secret-file reads or paid/provider calls.

## Actions

- The workspace reminder projection now includes the authoritative saved recurrence and timezone. Scheduled/sending records retain priority and the existing 201-read / 200-display bound.
- Reminder cards distinguish One time, Daily, Weekdays and Weekly on the saved local weekday. They show the saved reminder timezone even when the account timezone differs. Existing legacy/preview fixtures without a saved timezone fall back to the account timezone.
- Cancelled and completed records remain visible as bounded history, explicitly retain their actual status, use Last scheduled instead of Next and offer no Change/Cancel action. Only scheduled past records are labelled overdue. In-flight reminders retain their recall restriction.
- Reminder help explains that setting a task time does not request a text and completing the task leaves a separately requested reminder scheduled. The inline task editor calls its field Task time and briefly points to asking Tempo for a text reminder.
- Cancellation controls/confirmation and the success message say Cancel rather than implying deletion. Preview cancellation retains the cancelled record, matching the real read model. Spoken briefings read only scheduled/sending reminders.
- No delivery policy, schema, jobs or consent rules changed.

## Executed evidence

`npm run test -- src/app/workspace/SavedContextViews.test.ts src/server/db/repositories/workspace-repository.integration.test.ts`

Passed: 2 files, 34 tests. Includes saved cadence/timezone/account-isolation projection, terminal-state rendering and existing active-first/truncation coverage.

A fresh bounded seven-day reminder scenario is executed by the new workspace integration test named `replays a provider-free seven-day reminder week with separate task time, captured delivery and terminal history`. It uses the existing assistant simulator with isolated PGlite, an injected clock (November 2–8, 2026), explicit scripted commands and TestSmsTransport:

| Day | Action and durable-state assertion |
| --- | --- |
| Monday | Save Friday 3 PM New York task; stored 20:00Z; no reminder created. |
| Tuesday | Explicit weekday 11 AM reminder linked to task; replay same inbound identity; one reminder and one pending delivery job; saved recurrence/zone retained. |
| Wednesday | Manually exercise repository delivery transitions through SafeSmsSender into captured fake transport; replay send suppressed; one captured occurrence; next occurrence Thursday 16:00Z. |
| Thursday | Complete task; explicit reminder remains scheduled. |
| Friday | Scripted lookup + move to Monday noon; saved 17:00Z and weekday cadence retained. |
| Saturday | Scripted lookup + DONE; saved completed reminder remains in workspace history. |
| Sunday | Explicit cancel + inbound replay; saved cancelled history; no scheduled delivery job or delivery context; second account has no task/reminder. |

This is scripted code-path evidence, not observed live AI, carrier delivery, worker/pg-boss dispatch, browser interaction, user research or execution of the complete Maya/Luis/Priya novice-week plans. The Wednesday occurrence is delivered through repository + SafeSmsSender methods rather than the real worker loop. No real model, SMS, Calendar or catalog service is contacted.

## Remaining acceptance / limits

- Fresh authenticated browser/phone review of cadence labels, task editor explanation and cancellation remains root-owned.
- Full cross-cutting check/build and the complete novice-week plans remain separate root acceptance work.
- The complete novice-week plans are broader than this bounded reminder fixture; no complete Maya/Luis/Priya execution is claimed.

## Final bounded validation

`npm run test -- src/app/workspace/SavedContextViews.test.ts src/server/db/repositories/workspace-repository.integration.test.ts src/app/workspace/today-model.test.ts src/app/workspace/calendar-connection-view.test.ts`

Passed: 4 files, 49 tests. `npm run lint` also passed (exit 0). `git diff --check` passed; Git emitted only line-ending notices for concurrently edited C1 files.

`npm run typecheck` was run raw and exited 1 while C1 was being integrated: `invokePaidMessage` was not yet exported from `paid-invocation` in composer/reviewer/parser/presentation/authorizer callers, with derived implicit-any callback errors. It reported no W2 file errors. This is not a typecheck pass; root owns the final run after the concurrent C1 seam is complete.



## Integrated-check regression follow-up

Root's full check exposed two old assertions in `src/server/db/repositories/item-review.integration.test.ts` that expected a cancelled reminder to disappear from the workspace. Updated only the nearest test contract: owner workspace retains the exact cancelled reminder; the database row remains cancelled with its timestamp; a delivered conversation message remains unchanged; another account sees no reminder; item-review cancellation offers no delivery context and closes its review. Goal/life removal, memory forgetting and existing ownership/freshness/in-flight safety assertions remain intact. No application source or cancellation policy changed in this follow-up.

`npm run test -- src/server/db/repositories/item-review.integration.test.ts src/app/workspace/SavedContextViews.test.ts` passed **2 files / 27 tests**. File-scoped ESLint and `git diff --check -- src/server/db/repositories/item-review.integration.test.ts` passed. Root owns the subsequent full-check rerun; this follow-up does not claim it passed.
