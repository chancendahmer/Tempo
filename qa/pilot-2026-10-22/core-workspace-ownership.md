# Core workspace draft ownership

Date: 2026-10-22. Scope: workspace, setup, and feedback HTTP writes and the mounted core workspace. No migration, paid provider calls, deployment, or secret files.

## Confirmed defect and change

An account A tab could retain a new-item/chat/setup/feedback draft after its browser session cookie changed to account B. The server formerly derived only the current cookie owner, so an A draft without an existing object ID could be saved to B.

Authenticated workspace reads now echo the verified server account cache key. Workspace, setup, and feedback POST requests must supply the observed key in `x-tempo-account`; missing or unequal keys receive 409 `account_changed` before rate-limit updates or persistence. The session still determines the authorized user ID. The header is a cache identity, not authentication or model context. Successful responses echo the server key, and clients require an owner match before reconciliation.

The core workspace renders its complete stateful view with the verified owner as its React key. Same-owner polls and temporary failures preserve the existing mounted draft/editor/undo/chat/retry state. Different owners or explicit account invalidation unmount it before replacement data is displayed. Preview has its own fixed key and retains its local-only behavior. Account/workspace outages retain the last loaded view while write handlers refuse saves; feedback submission is disabled. Authentication loss is handled before parsing JSON, so malformed 401 bodies cannot retain ownership. Obsolete/unmounted response handlers cannot reconcile a replacement owner's data or dispatch feedback errors into its dialog.

Feedback retry identity is content-and-owner scoped. An uncertain same-owner retry keeps its request ID. A changed owner cannot reuse the prior ID or accept its receipt. Existing 15-second timeout, timer cleanup, friendly recovery, and native browser fetch receiver fix remain in place.

Normal HTTP QA helpers now observe server-returned keys before writes; they do not compute keys from fixture database IDs. The existing profile QA update also supplies its dedicated expectedCacheKey body field.

## Validation and limits

Targeted route tests cover stale/missing keys on new notes, task creation, chat, and check-ins; same-owner success and normal auth/origin status behavior; setup and feedback rejection before persistence; and the existing private outage paths. A hook/render harness exercises the real workspace refresh closure for cross-owner snapshots, 503 retention, malformed 401, and superseded response bodies. Key-lifetime tests verify same-owner retention, owner-switch remount, pending/missing identity exclusion, and preview separation. Feedback tests cover timeout/network/malformed recovery, owner-bound receipts, request identity, and malformed 401.

Final raw validation: `npm run lint` passed; `npm run typecheck` passed; nine focused test files passed all 100 tests. An independent agent reran the same nine suites with the same result and reported no remaining actionable finding in this core scope.

This report records code and isolated mocked tests, not physical browser/device or live model observations. Parent owns the integrated release check and browser verification. Existing logout/calendar/other mutation contracts are outside this bounded package; this is not proof of global cross-tab mutation isolation.
