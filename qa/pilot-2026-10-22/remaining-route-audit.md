# Remaining authenticated route audit

2026-10-22; initial bounded read-only audit of calendar, extensions, board, logout, and their direct callers. The initial audit made no product edits, secret reads, provider calls, or live account changes. Authorized implementation and subsequent validation are recorded below. Findings below distinguish source-confirmed paths and isolated synthetic checks from actual browser/provider observations.

## Findings

### P1 — OAuth failure logging still accepts sensitive error objects

`src/app/api/auth/google/start/route.ts:27` logs `{ err: error }` at error level; `src/app/api/auth/google/callback/route.ts:45` does the same at warn level. Direct callees perform Drizzle insert/update operations and Google code exchange. An unexpected error therefore reaches the logger with its original SQL/message/parameters or SDK request metadata intact. Current logger redaction does not sanitize arbitrary `err.message`, `err.query`, `err.params`, or nested `err.config.data`.

Demonstrated offline: the installed Pino serializer with the exact redaction-path array read from `src/server/observability/logger.ts` retained all four synthetic markers in those fields for both logging calls. No real token, SQL parameter, provider exception, or production log was examined. This proves the logging sink permits sensitive fields, not that an actual credential was exposed during this audit.

Smallest repair: log fixed operation names and fixed messages only, following the adjacent authenticated routes. Mock both OAuth routes' database/provider/session failures and assert that logs contain no error object/message/query/parameters/config. Preserve the current invalid-token401, start503, callback failed redirect, and successful redirect/cookie behavior. Keep changes local to these two catches; this does not require a global logger rewrite.

### P1 — Calendar event reads can mix another account's events into a still-mounted workspace

`src/app/api/account/calendar/events/route.ts:13-19` selects the current cookie owner and returns events without an owner discriminator. `src/app/workspace/use-calendar-events.ts:14-20` sends no expected owner and accepts every schema-valid event payload; the hook's current result key contains day/timezone/phone suffix/status but no verified cacheKey. Home and Calendar both call this hook.

Concrete sequence: A's connected workspace remains mounted; another tab changes the cookie to B; A triggers the calendar refresh before the next account/workspace owner poll; the route fetches B's agenda and the A-mounted hook accepts it. The new whole-workspace owner key and abort cleanup remove the view after an owner change is observed, but cannot prevent this earlier acceptance. Existing calendar schema strips unrecognized fields, so merely adding a server cacheKey without client checking is insufficient.

Demonstrated offline: the real `fetchCalendarEvents` helper accepted a synthetic B event payload carrying an unrelated owner key. This was an injected response, not a two-account live browser/provider reproduction. The route/caller sequence is source-confirmed. There is no direct event create/update/delete endpoint in this audited HTTP path; those adapter operations use a different confirmed assistant flow. Agenda can also mark the selected B connection as requiring reauthorization on missing scope/provider authorization failure, so the GET has a limited local-state side effect.

Smallest repair: pass the workspace's verified cacheKey into the calendar hook/helper; send the expected key and compare it on the server before the limiter/provider call; echo the server key and validate it before accepting events; include the key in hook ownership/lifetime. Handle401 before JSON. Tests should cover cookie B plus expected A with no provider/limiter call, mismatched successful payloads, obsolete responses, and normal same-owner/preview behavior.

### P2 — Stale logout/reset intent revokes the current browser session

`src/app/api/auth/logout/route.ts:13-15` revokes the request's current cookie and clears it, without an expected owner. Workspace, profile, and `resetPhoneSignup` all POST without ownership. Thus an A tab's old logout/reset action after a cookie switch can revoke B's session. `WebSessionService.revoke` updates only the hash matching that cookie, so this is a current-session availability/account-confusion issue, not a demonstrated B content write or global logout. Origin checks and operation-only error logging are already present.

This is source-confirmed, not an actual two-account logout performed here. Smallest verified-account repair: send the observed verified cacheKey from profile/workspace and compare before revocation or clearing the cookie. The pending phone-reset caller needs deliberate handling: reject its missing/stale proof when the current session is verified; if isolation between different pending sessions is also required, use a separate opaque session-bound reset proof rather than exposing a pending account's identity/cacheKey. Preserve absent-session idempotency and retain client state on503.

## Boundaries that already hold

- Board and Extensions are GET projections, not account mutation handlers. They echo the verified server key; their `useAccountResource` callers reject owner mismatches and abort superseded/unmounted requests. Their unexpected-error logs are fixed operation-only records.
- Extension connection links carry signed scoped action tokens. Calendar disconnect verifies the token and mutates `action.userId`; a B cookie cannot retarget A's signed link to B. GET displays confirmation and POST performs the token-bound action. Its catches return fixed errors and do not log original exceptions.
- Google OAuth start binds state to the signed token's user; callback consumes that stored user once and saves its connection. A cookie switch does not change that mutation owner. A successful callback deliberately creates a session for the completed user and overwrites the browser cookie; that account-switch behavior merits explicit product intent but is not evidence of a B-target mutation bypass. PKCE/state expiration/single-use safeguards are present.

## Validation

`npm run test -- src/app/workspace/calendar-events.test.ts src/server/security/action-token.test.ts src/server/security/action-links.test.ts src/server/security/authenticated-route-errors.test.ts src/app/components/PhoneSignup.test.ts src/server/db/repositories/calendar-oauth-repository.integration.test.ts`: six files,48 tests passed. OAuth repository tests use disposable PGlite and an injected provider; no Google call occurs. The two additional inline checks used synthetic error/event data only, with output limited to boolean findings.

No code was changed during the initial audit phase; the authorized implementation below subsequently changed the bounded route/client files. The parent owns release decisions and any follow-up implementation. This bounded review is not a repository-wide route inventory or proof of global isolation.


## Authorized repairs and final focused validation

All three findings above have been repaired in this worktree without a commit, migration, or provider request:

- OAuth start/callback catches log only fixed operation names/messages. Callback configuration acquisition is inside the catch boundary; if configuration fails before APP_BASE_URL is validated, it returns a generic private,no-store503 instead of attempting a redirect or leaking an exception. Normal signed-token/state ownership, cancellation, failed redirect, and successful session creation remain covered.
- Calendar GET requires `x-tempo-account` before limiter/provider work and echoes its verified key. The hook/helper require that observed owner, reject mismatched responses, include owner in the mounted result key, and handle401 before JSON. Cleanup suppresses both late projections and late account-invalidation events. Preview remains local and needs no owner proof.
- Account status returns an opaque top-level `sessionKey` for a valid current session, including pending sign-in sessions. This is domain-separated SHA256 of the opaque cookie token, distinct from the database token hash, not a credential or pending account identity. Account-state keeps it separate from PublicAccount; suspend/auth loss/account invalidation clear it, temporary lookup failure retains the last observed proof with recovery state. Logout requires exact `x-tempo-session` for an active current cookie; stale/missing proof returns409 without revocation or Set-Cookie. Absent/expired sessions can still be cleared idempotently. Lookup/revocation failures return private503 and preserve the cookie. Workspace/profile/logout and pending-reset callers use the observed proof; they do not acquire a fresh proof to automatically replay an old logout intent.
- Pending cleanup holds its first observed session proof through suspend/outage/manual retry. A changed session asks the user to reload and check the account without forgetting the local pending marker; successful reset/new signup clears the completed attempt's proof so a later legitimate pending reset can start independently. The initial account lookup must finish before a pending reset starts.
- A separate observed profile save-notice issue was repaired cohesively: success triggers a scoped account refresh, preserving the same owner's editor and Saved notice. Real account/auth transitions still invalidate/remount. Editing either field clears the old Saved notice.

Final author validation: `npm run lint`, `npm run typecheck`, and `git diff --check` passed. Twelve focused files passed all80 tests: OAuth route privacy, calendar events route/helper/lifecycle, logout routes, public account/session proof, phone signup, account-state, authenticated route errors, profile actions, account recovery views, workspace ownership. The tests inject errors/providers/fetch responses; no live provider was called. New regressions are designed to fail the prior raw-error, unbound-owner/session, and save-remount behavior. This iteration did not temporarily restore old product code in the active browser runtime to run a before-version test.

Existing local HTTP helpers were adjusted to observe and carry the new proofs rather than derive them from fixture IDs. The independent reviewer owns `account-owner-http.ts` and its local HTTP follow-up. Parent owns integrated release checks and actual browser verification. Request-time proof checks do not claim atomic ordering of concurrently arriving Set-Cookie responses from separate in-flight browser requests.
