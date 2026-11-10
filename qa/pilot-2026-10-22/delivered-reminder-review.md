# Independent delivered-reminder follow-up review

Reviewer: `c1_ledger`, independent of implementing `w2_reminder_clarity`. Adaptive worktree, October 22, 2026. No provider calls, production changes or commits.

The review covers the reminder service/repository changes, dedicated delivered-follow-up integration tests, Maya's updated first-week assertions, direct authorization/ownership callers, schema constraints, SMS permission checks and delivery/history paths.

Independently executed final tests: five files passed, 51 tests passed. The domain/delivered-follow-up/first-week suites passed 19 tests in 24.96 seconds; the standard parser integration and turn-write-policy suites passed 32 tests in 6.96 seconds. The scripted first-week scenarios, mocked model responses and captured SMS transport are synthetic evidence, not live model/provider behavior.

An additional isolated real PostgreSQL probe used two independent pools against a freshly created, strictly run-owned loopback database. Twenty competing duplicate repository requests produced exactly one follow-up and one provenance receipt. The original sent reminder, completed delivery job and delivered-message rows remained byte-for-byte unchanged. Hard account deletion removed all account reminders, jobs, messages and receipts. The run-owned database was removed.

Findings sent directly to the author:

1. A raw same-source create followed by delivered-reminder reschedule reached the `(source_message_id, source_operation)` unique constraint and raised SQLSTATE 23505 instead of a clean conflict.
2. A pending reminder update followed by a delivered-target update using that same source replayed the pending reminder's `reminder-update:<source>` job as `updated`, without checking the different requested target.
3. The new fingerprint serialized an invalid `Date` before the finite-date guard; the domain protected current public callers, but the direct repository boundary could throw.

These require violating the current parser's one-write-per-message contract; the independently inspected parser enforces that limit and returns canonical reminder-write results immediately. Outer owned execution also atomically persists successful replies with mutations, so retries use the saved confirmation. They were repository-contract hardening findings, not a demonstrated cross-account write or consent bypass.

All three findings are resolved. The author added an existing-source conflict check, target/fingerprint validation for prior update jobs, request fingerprints on new ordinary update receipts, and finite-date validation before fingerprint serialization. The reviewer inspected those changes and reran the isolated two-pool PostgreSQL probe: create-then-follow-up now returns `conflict`; a pending-update receipt no longer aliases a different delivered target; twenty competing duplicates still create exactly one follow-up/receipt; original history stays unchanged; account erasure remains complete. The new malformed-date/source-reuse regressions passed independently. Both run-owned databases were removed.

Authorization and safety observations: owner/source/direction filtering precedes mutation; the normal turn authorizer and fresh reminder-ID lookup remain in place; sent recurring rows are rejected; future instants are confirmed in the preserved reminder timezone; terminal/sending states do not fork; account status, pause and latest SMS consent are checked while holding the account row lock; delivery retains its separate permission check. The follow-up, scheduled action and durable provenance receipt share one transaction. No accounting/network transaction is introduced.

Initial disposition after the duplicate/conflict review was no remaining findings within the one-write-per-source contract. **That approval is reopened by the confirmed locking defect below.** This does not add generalized multi-operation source reuse; reverse follow-up-then-create remains outside that contract and the existing creation replay semantics were not broadened. This review does not claim live SMS billing/delivery, real model interpretation or a deployment pass.

## Locking follow-up requested by the lead

The lead identified an omitted lock-order inversion. Independent review confirmed both cases using actual repository callers, actual outer owned execution and two PostgreSQL connections in fresh run-owned local databases:

- Follow-up: `ConversationRepository.withOwnership` owns the inbound source, then `update` locks the target reminder and finally the user. The actual UI `mutateWorkspace(remove_reminder)` locks the user before cancellation locks the reminder. Pausing after the follow-up's reminder lock and starting UI cancellation produced SQLSTATE `40P01` on the UI transaction.
- Account deletion: pausing actual `withOwnership` after its source lock, then starting actual `deleteAccount`, let deletion own the user and wait for the source cascade. Releasing the follow-up produced SQLSTATE `40P01` on deletion. Moving the user lock only inside `update` is insufficient because outer ownership already holds the source.

Both failing baseline runs removed their isolated databases. No shared fixture or production data was changed.

The implementer corrected both boundaries: direct reminder updates lock the owned account before source/target; `executeCommand` requests the scoped optional `accountFirst` ownership mode for reminder writes, so the outer account lock also precedes its inbound-source lock. Other ownership calls retain their previous behavior. The reviewer inspected the actual call chain: independent authorization/model calls precede this short mutation transaction; reminder SQL plus saved reply complete inside it; SMS transport runs afterward. Capture-with-reminder is also SQL-only. The change does not hold a user lock around provider work or the overall parser loop.

The reviewer reran both exact controlled PostgreSQL interleavings with actual outer ownership and the actual UI/deletion repositories. In both cases the competing operation demonstrably waited, then both transactions fulfilled after release; `deadlockObserved` was false. Each fresh run-owned database was removed. These tests close the two demonstrated inversions rather than relying on a general scope disclaimer.

Durable executable regressions, with fixed loopback/dedicated-database create/drop guards and a runtime ceiling:

```powershell
npx tsx qa/pilot-2026-10-22/delivered-reminder-lock-race.mts
npx tsx qa/pilot-2026-10-22/delivered-reminder-lock-race.mts --delete
```

The first forces UI cancellation overlap; the second forces account deletion overlap. They assert that both actual operations finish without `40P01`, and emit success only after deleting their own isolated database. A new ordinary integration test checks production flag wiring, creation and rescheduling, persisted schedule time, and that parser, authorizer and SMS awaits occur outside account-first mutation scope. Its independent final rerun passed: one file / one test, 3.63 seconds. Initial failures in that new test were fixture issues (transport binding and a missing scripted authorization grant), corrected by the implementer before this independent pass.

Final focused disposition after the locking correction: **approved with no remaining actionable findings in the reviewed delivered-follow-up flow**. Both proven deadlocks have executable passing regressions, authorization/idempotency/history checks remain intact, and the account lock is confined to the short SQL mutation/saved-reply boundary. The earlier 51-test pass remains the broader scoped regression evidence; this focused locking follow-up adds the independently passing ownership-boundary test and both real PostgreSQL interleavings. The lead owns the final integrated check.
