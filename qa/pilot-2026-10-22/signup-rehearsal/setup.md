# Bounded pending-signup browser rehearsal

Prepared fictional, unused contacts in isolated `127.0.0.1:55437/tempo_ui_release`: **+12025550100**, then **+12025550101**. The preparation query examined only reserved fictional candidates, wrote no database records, and saved `rehearsal.json`. Do not rerun prepare to rotate identities during this rehearsal.

Stub command from the adaptive worktree:

```powershell
node qa/pilot-2026-10-22/signup-rehearsal/signup-stub.cjs
```

The new stub is running on **127.0.0.1:3199**, known PID **40756**, tool session35055. Only `POST /v3/verified-contacts` is implemented; only the two manifest contacts and synthetic placeholder authentication are accepted. The response is shared-line, pending, `verified:false`, with reserved fictional line +12025550111. There is no outbound request code. Counters are local `signup-stub-counts.json`, initially0 accepted/0 rejected; old October18 counts are untouched. No direct contact smoke was sent, so the first accepted contact should be the first actual browser signup.

Root alone coordinates restarting its existing localhost3103 candidate with `--signup-stub` and the explicit `http://127.0.0.1:3199` Sendblue override, placeholder credentials, shared mode, and the existing public synthetic key. This preparation did not restart Next or operate the browser. Leave the worker stopped; do not follow an `sms:` link. This is a local pending-flow rehearsal, not carrier/provider verification.

1. In the isolated browser, submit the first number with fresh explicit consent. Wait for `/account/me` to observe its opaque session proof, then capture the exact original claim **before** recovery:

   ```powershell
   node node_modules/tsx/dist/cli.mjs qa/pilot-2026-10-22/signup-rehearsal/inspect.ts capture-old
   ```

   This reads only the first selected account/session and the second selected phone's absence, asserts an unverified recent unrevoked original session and zero scheduled actions, and signs a normal `account:signin` token for that exact existing session. It creates no session or job. Bearer output goes only to ignored `private/old-signin.local.json`, never stdout or a public report. `.gitignore` excludes the entire private folder. Use the saved URL directly in the browser without echoing or copying it into evidence.

2. Choose **Use a different number**. Verify the form resets, consent is unchecked, and the current original pending session is revoked. Submit the second number with new consent and wait for its pending state/proof. Do not send START.

3. Open the old saved sign-in URL and confirm its normal form. Expected POST result is400 for the now-revoked original claim, no replacement cookie, and no activation of either account. GET may still show a read-only confirmation page; GET alone is not redemption evidence. Root records the actual UI and returns to the replacement pending page.

4. Run the read-only metadata assertions after the reset/replacement and again after old-link POST if useful:

   ```powershell
   node node_modules/tsx/dist/cli.mjs qa/pilot-2026-10-22/signup-rehearsal/inspect.ts verify
   ```

   It checks only these two users' sessions/scheduled actions: captured original session remains unactivated and revoked; replacement has one distinct unverified, unactivated, unrevoked session; both have **zero scheduled actions of any kind**. It saves public booleans/counts to `pending-state-results.json`; no cookies, token hashes, bearer strings, or prompts are output. PostgreSQL connections force read-only transactions. This does not inventory unrelated pg-boss jobs or prove any external dispatch happened; no worker/provider is involved.

All modes reject alternate origin/database arguments and use only fixed loopback resources. Errors print a fixed assertion failure rather than raw database diagnostics. No account cleanup is automatic: root retains evidence until it explicitly authorizes removal of these two synthetic records. The ignored old link expires normally; do not regenerate it for a new session after reset.
