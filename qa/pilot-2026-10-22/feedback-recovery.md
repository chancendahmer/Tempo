# Q1 feedback submission recovery — 2026-10-22

## Trigger and change

The root reviewer reproduced a real failed-save flow by stopping only the isolated `localhost:3103` application while a feedback draft was open. The draft remained present, but the dialog showed raw `Failed to fetch` without recovery guidance. This implementation responds to that root-observed defect; this agent did not independently capture that browser interaction.

Read the installed Next.js `use client` guide before editing `PilotFeedback.tsx`. The component remains a client component with its existing design, fields, dialog behavior and styling.

The new cohesive `feedback-submission.ts` helper gives each manual submission a 15-second deadline covering both fetch and response-body reading. It aborts the transport at the deadline and always clears its timer when the operation settles. A promise race also releases the caller if a transport does not promptly honor abort; a late response cannot convert the already timed-out attempt into a successful UI receipt. There is no automatic retry.

Network failure, timeout, malformed JSON/receipt and uncertain server failure now produce:

> Your report could not be confirmed. Your draft is still here. Check your connection and retry with the same details.

`PilotFeedback` keeps the draft state and returns its saving state to false in `finally`, making the existing submit/close controls usable again. Schema-validated server error messages remain available for actionable 400/401/403/409/413/429 responses. Other responses do not expose raw transport/server details.

The helper retains the same request ID for the same normalized draft, including after uncertain outcomes. A changed submitted draft gets a new ID. A success requires a valid receipt UUID and ISO timestamp. Aborting or timing out does **not** claim the server did not save the report; retrying the same identity allows the existing server idempotency behavior to return the saved receipt.

## Executed evidence

`npm run test -- src/app/workspace/feedback-submission.test.ts src/server/domain/pilot-feedback.test.ts src/server/db/repositories/pilot-feedback.integration.test.ts`

Passed **3 files / 33 tests**. The 20 new helper cases exercise:

- Human network-error recovery, unchanged draft and request identity on retry.
- A never-resolving fetch and never-resolving body read, deadline abort, timer cleanup and successful manual retry.
- Valid actionable HTTP errors, malformed/uncertain errors, malformed receipt IDs/dates/shapes and no false success.
- Same identity for normalized identical drafts, a new identity for changed content, and ignored late success after timeout.

The helper tests use injected mocked fetch responses and fake timers. The existing server tests exercise feedback validation, persistence and idempotency in isolated test fixtures. No provider calls or real contacts were used.

Both raw `npm run lint` and `npm run typecheck` passed after these changes. The root owns the final integrated check and current browser retry/capture.

## Limits

- Draft/attempt preservation applies while this feedback dialog remains mounted. This adds no offline queue, persistent browser storage or recovery across a full reload, navigation, account change or remount.
- The real browser failure/retry and viewport/keyboard evidence belongs to the root reviewer. Passing helper tests alone do not establish browser layout, focus, clipboard behavior or physical-device accessibility.
- A timeout is an uncertain outcome; it does not undo a server write. The server request identity is deliberately retained for manual retry.

Only `PilotFeedback.tsx`, the helper, its behavior tests and this evidence file were changed for this task. No styling, server contracts, paid providers, secrets, commits or deployments were changed.

## Browser fetch receiver correction

The root then observed that retries still produced immediate recovery errors without a POST, despite an enabled valid form and a recovered local service. The first helper version stored native `fetch` directly as an instance property and called it through `this.fetcher(...)`; that binds the submission instance as the receiver, which a receiver-sensitive browser implementation can reject with `Illegal invocation`.

The default dependency now uses an arrow wrapper, `(...args) => fetch(...args)`, so the native API is invoked without the helper instance receiver. A new default-path regression models the native receiver restriction. It failed before the correction and passed afterward, unlike the original injected mocks which tolerated any receiver.

The helper/domain/repository suite was rerun: **3 files / 34 tests passed**, including the new receiver regression. Both raw lint and typecheck were rerun and passed after the correction. Root browser confirmation of a real POST remains distinct from this synthetic reproduction. A feedback dialog preserved across development HMR may retain the old helper instance; verifying a fresh mount avoids treating that stale development state as the new code. Draft/attempt state remains in memory only, as documented above.
