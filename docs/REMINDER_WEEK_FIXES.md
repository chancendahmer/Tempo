# Reminder conversation fixes — 2026-10-05

This release addresses the weekly SMS screenshots. It is based on production main after PR #20 and excludes the unrelated, uncommitted prototype changes in the original workspace.

## Changes

- An explicit request can create 2–8 reminders in one transaction. There is no need to send a filler reply to create the second requested time. Each operation has a source-message ordinal and a unique delivery job; retrying the inbound returns the original records.
- Reminder lookup results now expose account-scoped IDs and exact scheduled times to the model. Rescheduling requires a lookup in the current turn. Batch edits check all IDs, ownership, status and expected times before changing anything, and replace the old jobs atomically.
- Persisted delivered reminders supply an account-scoped subject reference. A new request can refer to that subject; the reference alone never grants write permission. A short clarification can retain it through one linked human exchange.
- An authorized “just add to my list, no specific time” can create an undated task from the pending request. Contextual creation and batches use the independent turn permission check.
- Explicit date/time constraints are checked before writing. Missing morning times require clarification. New explicit subjects do not inherit an unrelated request's schedule. Batch time moves preserve each original date.
- The permission classifier uses strict tool output and fails closed on malformed, incomplete or unavailable responses. Diagnostics distinguish response validation, timeout and provider failures without logging user text or provider error bodies.
- Reminder confirmations use the saved result directly. No second model pass can append a different timezone or repeat the confirmation. SMS formatting removes Markdown markers while retaining text and links.

## Validation and observed live behavior

Five new scripted regressions failed before implementation and passed afterward. Added coverage includes short time answers, task conversion, same-name reminder moves, duplicate inbound delivery, wrong dates/extra times, no-edit requests, foreign-account IDs, stale batches, SMS formatting and contradictory model confirmations. The existing follow-up test still covers an unrelated outbound interruption, another account and duplicate replay.

Real Claude Sonnet 4.6 replays used fictional local accounts, PostgreSQL-compatible PGlite storage, captured SMS and the normal orchestrator/repositories. No real SMS or Calendar writes were sent. Cumulative observed API cost: **$1.683474**, within the approved **$2** cap, across 65 provider requests.

Observed successful conversations included:

| Conversation | Saved result |
| --- | --- |
| Reminder request → “Just add to my list, no specific time” | One undated task |
| Saturday request → “2PM and 5PM” | Two reminders, same requested date |
| Wednesday/Thursday at 5 PM → move both to noon | Same two IDs and dates, both changed to noon |
| Morning list request → “11am?” | Next-day 11 AM reminder |
| Delivered reminder → “tomorrow at like 2PM also” | New reminder with the original subject, no unnecessary time question |
| Different account: “set 5PM too” | Clarification, no reminder created |
| New unrelated two-minute reminder | Correct relative time, no inherited morning constraint |
| Advice with “Do not change anything” | No additional records |

The first live iteration had one intermittent permission-classification failure on “11am?”. It passed four later replays after a repeat and classifier hardening; the original response was not captured, so its exact cause is not proven. A later replay caught correct stored time followed by a wrong model-generated confirmation. The deterministic confirmation regression and final live replay passed after removing that second model pass.

Release validation: `npm run check` (lint, typecheck, full tests, Next production build and operational TypeScript build). Final result: exit 0, 506 tests across 76 files; all checks passed. An earlier run caught an ES2022 worker-build compatibility error, which was fixed without changing compiler settings.

## Migration and rollout

`0023_third_mandroid.sql` adds `reminders.source_operation` with default zero and changes source uniqueness to `(source_message_id, source_operation)`. Existing reminder records retain their data. Both Railway services run migrations before starting; a dedicated PostgreSQL connection holds an advisory lock so their migration attempts serialize. Lock acquisition failure prevents startup. Unit tests cover lock lifetime and cleanup; this does not claim a separate real-PostgreSQL concurrency load test.

## Limits

- Live replay used the real model, but captured SMS and local storage do not prove carrier delivery, Google Calendar behavior, hardware alarms or production scale.
- Batches support multiple times on one date, or multiple dates sharing one time. Requests with several dates and different times require a simpler batch instead of risking swapped pairings. Batch rescheduling changes clock times while preserving dates; arbitrary multi-date moves remain outside this slice.
- A reminder containing a task list is a saved snapshot, not a dynamic morning rundown. It does not also create those tasks. Existing daily-rundown/product scope is unchanged.
- Canonical reminder confirmations prioritize accurate saved state. Compound questions attached to a reminder may need a separate conversational turn for advice.
- Previously missed or duplicate personal reminders were not silently repaired. No personal account records were changed during evaluation.
- These fixes are not a new overall commercial-readiness rating or proof that every assistant authorization/context limitation has been resolved.
