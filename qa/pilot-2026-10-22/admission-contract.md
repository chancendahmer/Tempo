# A1: private-pilot admission contract

Implemented locally on 2026-10-22. No production configuration was changed, no provider API was called, and no SMS or Calendar action was sent. No migration or additional service is required.

## Configuration

```text
PILOT_ADMISSION_MODE=open
PILOT_INVITED_PHONES=
```

`open` is the compatibility default. To close new enrollment, set `invite_only` with a private comma-separated list of explicit international phone numbers. Formatting such as `+1 (202) 555-0198` normalizes to the same exact identity as `+12025550198`; comparison uses canonical E.164, never prefix, wildcard or substring matching. Duplicate entries normalize to one identity. More than 100 input entries, malformed entries, trailing empty entries, empty invite-only lists, and malformed modes deny new admission. Malformed admission values produce a closed policy instead of throwing during general environment parsing, so they do not disable existing-account compliance handling.

The 100 limit applies to invitation entries. It is **not** an atomic total-seat cap, active-user cap or provider-capacity check. Verified existing accounts can exceed that number. Removing an already verified account from the list does not evict it or revoke consent. A genuine seat reservation/revocation system would need a separate durable enrollment model.

Use identical server configuration for the matching web/worker deployment and restart processes after changes: environment values are cached. Keep actual invitation lists out of source control, browser variables, logs and QA artifacts. `.env.example` documents the contract without real numbers. Mode remains `open` until an operator explicitly configures it; merely deploying this code does not make a public deployment private.

## Existing-account definition

The persisted user must have `phoneVerifiedAt != null` **and** an onboarding state other than `awaiting_consent`. A website signup row alone, a completed-but-unverified fixture, and an unknown sender's HELP record are insufficient. Consent/signup records cannot supply their own verification flag. The same predicate is used by web admission and inbound admission.

## Web behavior

`POST /api/early-access` validates phone/explicit consent, retains existing abuse-rate protection, and then checks admission before provider contact/line provisioning, consent writes, sessions or sign-in jobs. It permits invited phones or verified existing accounts. Denied enrollment returns HTTP 403 with instructions to use the invited number or ask the organizer to add it; the ordinary form retains the user's number so they can correct it.

An already opted-out phone returns a separate 403 before provider provisioning: reply START in its existing Tempo conversation, then return. Adding an invitation or checking website consent never silently clears STOP. The consent repository also preserves `opted_out`, its timestamp and revoked consent if a stopped phone reaches it through another caller or a race, and creates no welcome/context jobs for that stopped account.

## Inbound behavior

All provider routes authenticate the webhook before the common messaging repository. In closed mode, an uninvited/unverified ordinary message, START or unknown HELP returns a duplicate-safe no-op result. Provider routes ACK it using their ordinary success response. No user, conversation, identity, message, model job or rejection SMS is created. A replay is equally inert; the rejected chat body is not retained.

**STOP is the deliberate compliance exception.** An unknown rejected sender's STOP creates only an unverified `awaiting_consent` / `opted_out` user and revoked SMS consent evidence. It creates no conversation, phone identity, session, onboarding/model/outbound job or rejection text. For an existing rejected account it also cancels pending scheduled actions and queued interventions. A row lock serializes suppression; provider/event evidence makes repeated STOP no-ops. A replay of that STOP remains a duplicate even after a later invitation and explicit START.

Existing rejected-but-unverified accounts can still use HELP and natural-language pause. HELP schedules the existing compliance response; pause cancels outstanding work and stores the pause without a future resume job while admission remains denied. Neither path marks the phone verified nor activates a pending browser. Unknown HELP has no enrolled account or service state to disclose and remains an ACK/no-op. Existing verified users retain normal compliant behavior and sign-in.

Once a stopped number is actually invited, its explicit START follows the existing opt-in path: grant SMS consent, clear STOP, verify the inbound identity and queue onboarding. Invitation alone does none of this. A prior HELP from a denied unverified account cannot accidentally turn its next invited START into a returning-user browser claim or prevent genuine verification.

## Changed paths

- `src/server/domain/pilot-admission.ts`: bounded normalization and shared admission predicate.
- `src/server/config/env.ts`, `.env.example`: opt-in configuration and safe closed parsing.
- `src/server/db/repositories/pilot-admission-repository.ts`: persisted verification/suppression lookup for web admission.
- `src/app/api/early-access/route.ts`: admission/suppression checks before provider side effects.
- `src/server/db/repositories/messaging-repository.ts`: common inbound gate and durable pre-admission STOP suppression.
- `src/server/db/repositories/consent-repository.ts`: website consent cannot clear SMS STOP.
- `src/app/privacy/page.tsx`: factual Calendar disclosure now describes owned-event permission, primary-calendar reads, separately confirmed personal event writes and encrypted pending proposals.
- Nearest domain, HTTP and isolated PostgreSQL tests.

## Verification and remaining release work

Final package validation: **59 tests / 8 files passed**, plus fresh **`npm run lint` and `npm run typecheck` passed**, each exit 0. The test command covered admission domain/config, admission PGlite integration, early-access HTTP, messaging repository, proactive configuration, consent, inbound reliability and the provider-free journey. The first targeted run exposed a missing Vitest alias mock, which was repaired; the first concurrent typecheck exposed other packages' in-progress type errors, and the final raw rerun passed after those owners repaired them. Root records full integrated validation separately. These passes are not live provider evidence.

All integration tests here use a newly migrated in-memory PGlite database. Providers are mocked at the HTTP test boundary. No live signup, carrier STOP/START round trip, actual browser recovery or unfamiliar-participant journey was certified by this package. Root owns the final integrated `npm run check`, synthetic browser verification and release plan. Before enabling invite-only on a real deployment, operators must review already queued work and existing accounts: this ingress gate does not retrospectively revoke accounts or purge old jobs. Live worker/provider/reminder acceptance and structured issue reporting remain separate pilot requirements.
