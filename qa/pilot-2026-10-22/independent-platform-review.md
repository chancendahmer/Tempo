# Independent platform review — 2026-10-22

Reviewer: workflows engineer reviewing other authors' A1 admission and R1 reliability changes in the current working tree. W1 is excluded from this review and is not scored here. Source and nearest tests were inspected; no product code was edited by this reviewer during the integrated check. No paid calls, real provider writes, secret files or production access were used.

## Decision

The review found one P1 consent bypass, reproduced it in an isolated PGlite test, and independently verified the admission author's repair. No unresolved P1/P2 **code** finding remains in the reviewed changes. A local PostgreSQL fixture failure prevented an independent load rerun from reaching its workload; this is an outstanding verification limitation, not evidence that the application failed under load. Private-pilot release still depends on the external operating gates already listed by the authors.

## Findings and disposition

### P1 — pause could clear STOP without explicit START — resolved and independently retested

Original location: `src/server/db/repositories/messaging-repository.ts:275–278`, natural-language pause branch. It previously wrote `status: "active"` unconditionally. A stopped, unverified sender is intentionally allowed to request pause even while admission is denied. As a result, the sequence unknown STOP → `leave me alone` changed `isOptedOut` from true to false. A subsequent invitation made the stopped-phone check in `src/app/api/early-access/route.ts:54` pass, and the ordinary website consent repository could grant consent and clear optedOutAt without an intervening START.

The independent characterization test observed exactly that state transition and a granted web consent. No SMS was sent. The latest revoked consent initially continued to block outbound delivery; the unsafe step was replacing that revocation through subsequent website consent after status had been cleared.

The A1 author repaired the pause update at `messaging-repository.ts:277–280` with a persisted-status SQL expression retaining opted_out and its original timestamp. Resume scheduling at line 297 additionally requires the effective returned status to be non-stopped. This avoids trusting a stale pre-lock status snapshot. The author's matrix now covers verified/unverified × open/invite-only STOP→pause→invitation→pause→web consent, followed by explicit START.

Independent acceptance rerun: `qa/pilot-2026-10-22/independent-platform-probe.test.ts` now asserts the desired behavior: stopped status and exact optedOutAt retained, all consent evidence revoked, and zero scheduled work after website reconsent. **One test passed.** The probe no longer asserts accepted unsafe behavior. The nearest A1 selection also passed **32 tests / three files** after the repair.

### P3 — harness ambient environment claim is broader than implementation — open documentation/independence nit

`scripts/pilot-load.ts:141` creates `DrizzleMessagingRepository(database)` without an explicit admission policy. Since A1, `messaging-repository.ts:39` falls back to `getServerEnv()`, whose default input is process.env. That parser includes DATABASE_URL. Thus R1's statement that the harness never reads DATABASE_URL is literally broader than the current call graph, and malformed ambient configuration can affect this otherwise isolated drill.

The database object is still explicitly passed, and both pools use the hard-validated local/run-owned addresses. No production-target connection or credential exposure was observed. Recommended bounded cleanup: inject an explicit synthetic admission policy in the drill, or narrow the claim to “never uses DATABASE_URL as a database target.” This is not a discovered destructive-target bypass.

## Admission review evidence

- Shared predicate `pilot-admission.ts:22–31` uses exact normalized E.164 matching and verified persisted accounts; a signup row, HELP state or unverified completed fixture is insufficient. Invite-only malformed/empty lists and malformed modes deny new admission while established accounts retain compliance access. Default open mode is documented compatibility behavior, so deployment alone does not make enrollment private.
- `early-access/route.ts:50–56` checks admission and stopped status before provider contact/line provisioning, consent writes or session creation. Existing IP abuse limits remain first; phone-specific limits precede provider calls. Provider preparation is not certified by mocked tests.
- Denied inbound ordinary messages/START/unknown HELP return a no-op before account/conversation/model-job creation. STOP is a deliberate durable suppression exception; duplicate evidence survives later invitation and START. Existing rejected/unverified HELP and pause remain available without verifying identity or activating a pending browser.
- Website consent uses a persisted-state update to preserve opted_out and revoked evidence, including racing callers. The repaired pause path now preserves the same invariant. Explicit admitted START remains the supported reconsent action. Pending browser activation remains admission-gated; established sessions/accounts are intentionally not evicted by invite-list removal.
- No new provider side effect was found in the admission gate. Authentication still belongs to provider route handlers before this repository. No claim of real-carrier STOP/START or session recovery is made.

## Reliability review evidence

- `pilot-load-config.ts` rejects alternate hosts, ports, users, passwords, URL query overrides, databases and unbounded account counts before connecting. CREATE and DROP both require exact `tempo_pilot_<runId>_test` identity. The shared fixture is only an administrative connection target, never a cleanup target.
- Work is bounded to 100 accounts × two turns, four local consumers, two dispatch calls, two retries, a 105-second cancellation timer and a separate 120-second process watchdog. Query/connect timeouts exist. The watchdog kills only its own process; on a hard cutoff it may leave the run-owned database, which is disclosed for inspection.
- The scripted transport checks synthetic recipients and records acceptance exactly once. Its deliberate transient faults are explicitly marked not accepted. Global fetch is blocked; no real provider SDK is instantiated by the shown workload path. Scripted parsing and captured replies are correctly distinguished from real model/carrier output.
- The harness verifies duplicate ingestion, per-account completion chronology/private context, task-event idempotency under retries, healthy-account progress, a backlog above consumer capacity and final zero pending/uncertain/blocked state. The source and reported aggregate `reliability-load-100.json` are consistent: 100 accounts, 200 turns, ten deliberate failures/retries, four-consumer peak, 200 pending peak, 196 queue peak, 28.029-second drain. Those measurements were supplied by the R1 author; this reviewer did not reproduce the 100-account observation.
- Composer/reviewer at `intervention-composer.ts:11` and `intervention-decision-reviewer.ts:25` configure 15-second SDK timeout and zero SDK retries, below queue expiry. Safety text validation and explicit veto are retained. Reviewer unavailability still uses its **pre-existing** deterministic high-confidence fallback; this is not uniformly fail-closed AI behavior. Deterministic sending gates remain separate and were not weakened by R1. The SDK calls still lack job-signal cancellation, but their maximum operation window is now bounded; multi-process kill/restart and provider acceptance ambiguity remain separate evidence.

## Commands run and limits

1. Eight-suite A1/R1 source selection (admission domain/integration/HTTP, pilot-load guard tests, intervention composer/reviewer, context-evaluation-service and intervention-strategy): **56 tests passed** before the consent repair.
2. Independent original STOP/pause characterization: **one test passed**, reproducing unsafe behavior; then rewritten to desired safety assertions after the author's fix and independently rerun: **one test passed**.
3. Final nearest A1 selection: `npm run test -- src/server/db/repositories/pilot-admission.integration.test.ts src/server/domain/pilot-admission.test.ts src/app/api/early-access/route.test.ts`: **32 tests passed**.
4. `npx tsx scripts/pilot-load.ts --accounts 20`: **exited 1 before workload**, phase database_create, diagnostic `could not open file "base/1/4171": No such file or directory`. No run-owned database was successfully created, no drill workload started and no repair/destructive cleanup was attempted by this reviewer. Root was notified immediately.

No fresh full repository check, hosted-capacity test, real PostgreSQL race certification, live model, provider/carrier delivery, restart drill, alert delivery, backup/restore or encryption-key recovery is claimed by this review. The principal owns the final integrated validation and release decision.
