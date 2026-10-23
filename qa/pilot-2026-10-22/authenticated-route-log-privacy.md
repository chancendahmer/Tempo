# Authenticated workspace/session error-log privacy — 2026-10-22

Author: `workflow_backend`. Root reported raw Drizzle query/parameter output during its earlier isolated database-outage exercise. This pass inspected the named authenticated workspace/session boundaries and reproduced the problem with synthetic exceptions; it did not repeat an outage, read populated environment files, contact providers, deploy, or commit.

## Confirmed cause and implementation

Workspace GET/POST, account lookup/profile, board, and setup error catches passed the full error object to Pino. Driver errors may retain SQL, bound session hashes, profile content, nested causes and connection details; logger field redaction does not safely remove those values from error messages/stacks or arbitrary nested error properties.

Phone sign-in redemption, logout and extension lookup could instead throw their session/database exceptions out of the route, allowing Next's uncaught-error handling to print the raw error. Phone configuration loading also sat outside its catch.

The seven routes now log **static operation names and static messages only**, matching the existing feedback-route approach. No caught error, request URL/body, cookie/token/hash, account identifier, raw SQL, parameters or exception cause is passed to their log calls. Unexpected sign-in, logout and extension failures return controlled 503 recovery responses rather than escaping. Account/profile/extension/logout responses consistently use private/no-store caching; sign-in retains no-store, no-referrer and frame-denial headers.

Successful session activation/cookies/303 redirect, read-only sign-in preview, invalid or consumed link 400, missing/unverified session handling, mutation origin checks, input 400, conflict 409 and rate-limit 429/Retry-After behavior remain in place. Logout returns success and clears the cookie only after confirmed revocation; an unavailable revocation returns 503 and asks the customer to retry.

No shared repository, conversation/orchestration, reminder, database client, global logger or provider implementation was changed.

## Fresh executed evidence

Read the bundled Next route-handler and error-handling guides before editing routes.

Added `src/server/security/authenticated-route-errors.test.ts` with synthetic Drizzle-shaped exceptions containing a query, parameters, token hash, account/profile text, nested driver cause and connection details. After correcting the test harness's explicit alias mocks, **16 privacy cases failed before the product repair**: raw `{ err }` payloads, absent no-store headers, or uncaught errors. This was a mocked exception exercise, not a real database outage.

Ran:

```powershell
npm run test -- src/server/security/authenticated-route-errors.test.ts src/server/security/phone-signin-route.test.ts src/app/api/account/setup/route.test.ts src/app/api/account/feedback/route.test.ts src/server/security/web-session.integration.test.ts
```

Result: **5 files / 34 tests passed**. The new suite covers 14 session/read/mutation/limiter failure boundaries, two sign-in configuration failures, expected error statuses, connection-link reads, anonymous account status and confirmed logout. Assertions check operation-only log payloads, absence of synthetic private markers in response/log output, no session cookie on unavailable operations, and no-store headers. Existing phone tests verify preview safety and successful secure activation; existing PGlite session tests exercise session lifecycle and account ownership.

Raw `npm run lint` and `npm run typecheck` passed after the route edits. `git diff --check` passed on the owned route/test changes. Root owns the final combined repository check and independent reviewer assignment; author verification is not presented as final review.

## Scope and remaining limitations

- No live server outage/log-capture rerun was performed in this pass. Root's earlier outage observation motivated the change; fresh proof here uses injected failures at the real route handlers plus existing isolated session integration tests.
- Static operation labels preserve which customer operation failed, while deliberately omitting raw exception detail. This patch does not introduce a secure private diagnostic channel or classify arbitrary driver error text.
- Adjacent Google OAuth start/callback routes still log raw error objects. Those provider/connection boundaries were identified and reported to root, but were excluded from this authenticated workspace/session patch. This is not a claim that every route or worker log is privacy-safe.
- Framework access logs/request-URL logging, reverse-proxy logging, prior log retention, and populated real data were not audited or changed.
