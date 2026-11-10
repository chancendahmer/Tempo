# Independent recovery and delivery review

2026-10-22, adaptive worktree. Reviewer: C1/ledger agent, independent of the delivery-alert author (`c1_invocations`) and the phone recovery author (root). No author code was changed. No actionable finding within the two requested packages.

## Delivery failure signal

Reviewed `delivery-alert-detection.md`, the operations report and both nearest test files; traced the existing Twilio status webhook, status mapping and messaging-repository delivery update. Authenticated provider callbacks map `failed` and `undelivered` to stored terminal statuses; the repository applies allowed state transitions. The new detector uses the existing report query's outbound-only `failed`/`undelivered` count. It adds a fixed problem code and a fixed account-scoped, provider-receipt-first action. It adds no SQL, provider call, mutation, retry, ledger reset or replay. Other readiness and reconciliation problems remain independent.

The report executes in a repeatable-read, read-only transaction with a statement timeout and commits only a completed snapshot; failed reads roll back. Message inclusion remains `created_at >= since AND created_at <= now`, with the existing integer 1–168 hour window. Integration fixtures distinguish two current outbound failures from an inbound failure, delivered message, older failure and future failure. A later window includes only its matching future fixture. Private bodies, diagnostics and conversation identifiers are excluded from output. Controlled test-fixture status updates demonstrate recalculation, not an authorized repair procedure.

Limit: this is polling/report detection by message creation time, not delivery-event time. A newly received failure callback for an older message can fall outside a short selected window. The package documents this accurately and sends no external alert or notification. It establishes neither hosted alert delivery nor a safe blanket retry. Its guidance explicitly prohibits bulk replay/resetting uncertain sends.

## Phone-link recovery and copy

Reviewed `src/app/api/auth/phone/route.ts`, its HTTP-boundary test, action-token verification, actual session redemption and nearest session integration tests. The new recovery documents interpolate only internally chosen constant titles/details; incoming tokens, URLs and raw exceptions are not reflected. The recovery link is fixed to `/login`. HTML retains `no-store`, `no-referrer`, frame denial and a CSP denying scripts/default resources, with only static inline styles permitted; forms remain same-origin and base URLs are prohibited.

Invalid/expired/used/cross-origin rejection remains HTTP 400; operational failure remains HTTP 503. Neither recovery branch sets or clears a session cookie. GET continues to verify and preview without redeeming a session. The original POST origin check, atomic one-time session activation, account verification and successful 303/cookie flow are unchanged. The actual session integration covers single-use redemption and unrelated-browser isolation. The branded HTML is a presentation change, not an alternate authentication path.

Reviewed the two requested copy corrections in `src/app/page.tsx` and `src/app/components/PhoneSignup.tsx`: the landing note says texts/dashboard share an account, and legacy submitted markers instruct finishing phone setup rather than promising an automatic text. Neither copy correction adds a request, changes consent or changes session state. The broader pending-sign-in reset/session-proof changes visible in the same shared file were outside this bounded copy review and were not re-certified here.

## Independent validation

Raw command:

```powershell
npx vitest run src/server/observability/pilot-operations-report.test.ts src/server/observability/pilot-operations-report.integration.test.ts src/server/security/phone-signin-route.test.ts src/server/security/web-session.test.ts src/app/components/PhoneSignup.test.ts
```

Result: four existing files, 21 tests passed. `web-session.test.ts` does not exist and was not counted; the actual integration file was run explicitly next:

```powershell
npx vitest run src/server/security/web-session.integration.test.ts src/server/security/action-token.test.ts src/server/domain/messaging.test.ts
```

Result: three files, 16 tests passed. Total independently observed: seven files, 37 passing tests. These use mocked HTTP dependencies and disposable PGlite where applicable; they are not paid/provider or hosted observations. No production data, populated environment file, external message or commit was involved. Root owns the real-browser expired-link/recovery observation and broader validation; this review does not claim those were independently performed.
