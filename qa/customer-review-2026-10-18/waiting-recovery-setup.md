# Real-route waiting recovery: isolated setup and boundaries

Source inspection, direct local-stub containment smoke and real local HTTP
reset/late-link assertions were completed. Root owns browser execution. The
only provider-shaped requests reached the loopback stub; no external provider
contact was made.

The original isolated server had no provider credentials. `POST /api/early-access`
defaults to Sendblue and cannot complete `prepareContact` without them. It can
record rate-limit counters before failing; it does not yet write consent or
create a session on that failure path.

To exercise the actual route safely, use a local HTTP stub and restart only the
known candidate with these explicit synthetic settings:

```text
MESSAGING_PROVIDER=sendblue
SENDBLUE_API_BASE_URL=http://127.0.0.1:<local-stub-port>
SENDBLUE_API_KEY=local-qa-placeholder
SENDBLUE_API_SECRET=local-qa-placeholder
SENDBLUE_PHONE_NUMBER=+12025550111
SENDBLUE_ONBOARDING_MODE=shared
```

The stub should bind only `127.0.0.1`, reject all unexpected routes, validate
synthetic `+120255501xx` recipients, and handle only
`POST /v3/verified-contacts`. For body `{"phone_number":"+12025550181"}`,
return:

```json
{
  "status": "OK",
  "data": {
    "contact": {
      "phone_number": "+12025550181",
      "verification_status": "pending",
      "verified": false
    },
    "line": { "phone_number": "+12025550111", "type": "shared" }
  }
}
```

Submit an unused synthetic number through the actual browser form, with the
explicit consent checkbox. The route records web consent with `user_first`,
creates the pending session cookie and returns 202 with the real onboarding
assignment. `user_first` suppresses initial welcome/context jobs. Pending
`verified:false` plus shared mode avoids both the direct verification-message
request and queued sign-in jobs. Assert zero `scheduled_actions` for that new
account before proceeding; leave the worker stopped.

The browser stores `tempo-early-access-submitted`, polls `/api/account/me`, and
shows “Use a different number”. That button first suspends polls and posts to
`/api/auth/logout`. A successful response revokes the current pending session,
clears its cookie, then removes the storage marker, clears area/number/consent
and focuses the area field. The user can submit a fresh synthetic number with
new consent. Failed logout must keep the waiting marker and show retry UI.

For late-old-link evidence, sign a normal `account:signin` action token against
the **original pending session ID**, retain it only in process memory, then
attempt redemption after successful browser recovery. Do not create a second
session for that old number: it would test a different claim. Original-session
POST redemption must return 400 because logout set `revoked_at`; GET remains a
read-only confirmation page. A separate later `activatePending(oldUserId)` call
also excludes revoked sessions. Browser proof should confirm the old response
cannot redirect the recovered tab into the abandoned account.

For failed logout, browser tooling may return one controlled failure for
`/api/auth/logout`, then allow the real request on retry. Label that failure as
browser-injected evidence. Test legacy `"true"` and malformed stored markers
separately; they also expose the recovery controls. Use isolated browser state
so the Alex workspace session is preserved.

External-dispatch risks: omitting the loopback API override reaches the default
Sendblue API; dedicated mode can directly request verification; a verified stub
response queues `send_signin`; switching to Twilio skips onboarding and queues
welcome/context jobs; running a general worker could consume unrelated existing
actions. Keep the allowlisted launcher, explicit loopback override, shared
pending response and no worker. Do not follow the `sms:` START link: it invokes
an external messaging application. This setup proves neither carrier receipt
nor provider verification/callback behavior.

`signin-existing-local.ts` is the separate browser access helper for the
existing Alex (0199) fixture. It creates only a new normal pending session and
prints a short-lived one-time URL to stdout. It never seeds, grants consent,
adds reminders/items, queues jobs, or persists bearer output. Run it without
output redirection when needed.

Prepared executable helpers:

```powershell
node qa/customer-review-2026-10-18/signup-stub.cjs
# After stopping only the known 3101 candidate, never as a second Next server:
node qa/customer-review-2026-10-18/start-candidate.cjs --signup-stub
npx tsx qa/customer-review-2026-10-18/waiting-reset-http.ts
# For a browser-submitted pending number, before clicking recovery:
npx tsx qa/customer-review-2026-10-18/pending-signin-link.ts +12025550181
```

The stub currently listens on `127.0.0.1:3199`, original PID 31536. Candidate
3101 was not restarted during preparation; it was later restarted only after
root's explicit signal. Containment smoke passed: a reserved
contact returned 200, an out-of-range recipient 400, `/api/send-message` 404,
and incorrect placeholder authentication headers 401. Initial aggregate counts
are therefore **1 accepted / 3 rejected**, all direct stub smoke, no candidate
writes. `signup-stub-counts.json` stores counts only and never request bodies,
headers or bearer values. Counters reset when this QA stub process restarts.

The HTTP assertion script passed after the coordinated candidate restart:

- Real signup 202 created a pending cookie; shared pending response indicated
  no verification message and no sign-in job.
- Foreign-origin logout returned 403 and left the exact pending session
  unrevoked and retryable.
- Same-origin logout returned 200, revoked that session and expired the cookie.
  Reuse of the original cookie then returned no account.
- A replacement signup created its own pending account. A normal token created
  for the **original exact session before logout** returned 400 on later POST
  redemption, set no cookie, left the original session unactivated and revoked,
  and did not replace or activate the replacement account.
- Both new synthetic accounts had zero scheduled actions; cookies and tokens
  remained only in process memory. No bearer output was produced.

Evidence: `waiting-reset-http.log`, exit 0. Stub counters immediately after this
run were **3 accepted / 3 rejected**: baseline 1/3 smoke plus exactly two real
route contact requests. Subsequent root browser work may increase counters.
The foreign-origin 403 is an actual server rejection and tests retryable pending
state at the API level; it does not establish browser handling of a network/503
failure, cleared input/consent/focus behavior, or stale-poll suppression.

The old known Next launcher PID 2924 and its descendants were the only processes
stopped. New launcher PID 30364, CLI 27392, listener 40696 serve the same
`http://localhost:3101` using `--signup-stub`; PostgreSQL PID 34720 and stub PID
31536 were retained. The exact existing database, prior fixtures and browser
cookie signing key were preserved. No worker, production build, full check or
external provider was started for this verification.
