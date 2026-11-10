# W2 / Q1 independent review — 2026-10-22

## Actual browser gate: blocked

This run did **not** complete a browser audit. The current `mcp__cua_repl` session returned `apps: []` and `browsers: []` from `cua.getState()`. The explicit attempt:

```js
await cua.createBrowserTab("iab", "http://localhost:3103/workspace", { visible: true });
```

returned `Browser is not available: iab`.

No current-run screenshots were captured. Earlier screenshots in this QA directory were not reused as evidence. Desktop/phone layout, focus order, keyboard trapping/restoration, browser retry interaction, clipboard permission denial, and assistive-technology behavior remain unverified. No physical-device or screen-reader claim is made. Product Design audit/router/critical-overrides and Computer Use skills were read; Product Design context preflight found no saved context.

## Executed fallback: local HTTP and PostgreSQL only

The local application at exact `http://localhost:3103` responded with 401 to an unauthenticated workspace request. A fresh synthetic account was created only in the fixture database `127.0.0.1:55437/tempo_ui_release`. Its normal phone sign-in action was redeemed through the local HTTP endpoint using the fixture's documented synthetic signing key. Tokens, cookies, phone numbers, and credential values were kept in memory and were not printed or saved.

The following checks executed successfully against that account. These are HTTP/database checks, **not observed browser or live AI behavior**.

| Step | Check | Result |
| --- | --- | --- |
| 1 | Save a task with a specific future task time through the authenticated workspace action. | Passed: one task persisted; no reminder was created. |
| 2 | Seed run-owned one-time, daily, weekday, weekly, cancelled, and completed reminder fixtures; read them through the authenticated workspace endpoint. | Passed: all six records retained their authoritative cadence, timezone and status, including a saved timezone different from the account timezone. This does not verify rendered label formatting or layout. |
| 3 | Cancel an active reminder through the authenticated workspace action, then read again. | Passed: the record remained in the response with `cancelled` status; the record count stayed six. |
| 4 | Complete the task through the authenticated workspace action. | Passed: the task became completed and the separately saved weekday reminder remained scheduled. |
| 5 | Submit one synthetic feedback report, retry the identical request, then replay the same request ID with changed detail. | Passed: the first two requests returned 201 and the same receipt; the changed replay returned 409. This did not simulate a browser transport interruption. |
| 6 | Independently inspect only this run's account records in the fixture database. | Passed: exactly one feedback record and zero scheduled provider jobs. |

The temporary script ran from standard input with `node --import tsx`; it was not added to the repository. It verified `current_database()` before fixture writes. The six PASS groups completed with exit 0. No populated environment files, production accounts, external contacts, model, SMS, calendar, or catalog providers were used. The synthetic fixtures remain in the isolated local QA database for follow-up inspection.

## Remaining release evidence

1. Open a fresh authenticated local account in a supported browser and capture desktop and phone-width reminder screens. Check cadence/timezone labels, cancelled/completed history, and the task-time-versus-text explanation.
2. Exercise the actual feedback dialog with keyboard navigation and close/reopen focus restoration.
3. Exercise a failed/uncertain feedback submission and retry in the browser, then verify a single durable receipt.
4. Deny clipboard access in a supported browser and verify the reference field is selected, fallback instructions are announced, and manual copying works.

These are named outstanding gates, not claimed failures of the product. Source inspection and prior unit/component tests cannot substitute for the missing current-run browser evidence.
