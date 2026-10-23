# First-week acceptance — Maya, Luis and Priya

Executed provider-free on the adaptive managed worktree. The executable cases are `src/server/testing/first-week-acceptance.integration.test.ts`, supported by `first-week-fixtures.ts`. The root-authorized delivered-follow-up fix changes reminder-service.ts and reminder-repository.ts; the initial acceptance package was tests only. No commits, production deployment/data changes, provider outreach, paid API calls or secret-file reads were performed.

## Result and evidence boundary

**Three deterministic scenario tests pass, with 21 end-of-day durable-state checkpoints. Maya's previously unmet delivered-reminder rescheduling path is now fixed and exercised:** the same existing reschedule command creates one linked fresh occurrence, explains that the original was delivered, preserves that sent record/message and replays without another job. This does not certify live language interpretation or the other external gates below.

Command:

`npm run test -- src/server/testing/first-week-acceptance.integration.test.ts`

Latest executed result for the fixed path: **1 file / 3 tests passed, no TODO**. Each scenario creates its own temporary PGlite database and two synthetic accounts. The injected trusted clock advances January 11–17, 2027, in America/New_York. Only Date is faked; persistence and application services actually run. Every simulated day rereads the workspace, checks no foreign marker leaked, and checks the second account's saved state is unchanged.

The parser and independent write grants are explicitly scripted fixture adapters. Grants cover only the turn's declared command types; read-only advice cases deliberately propose a mutation and prove it is denied. Tool execution, domain authorization checks, repository writes/reads, receipts and conflicts are real application paths. A mock constructor forbids real Anthropic clients, and an external-fetch guard rejects and asserts zero external requests after fixture initialization. SMS goes to TestSmsTransport. The delivery helper calls repository transitions and SafeSmsSender, suppresses duplicate sends, and explicitly emulates durable job completion; it does not run pg-boss or a real worker. Command selection and independent permission grants are scripted rather than observed live AI. The delivered-follow-up explanation now comes from the production reminder service, not injected fixture wording.

## Executed daily checks

| Day | Maya — project and recovered next step | Luis — changed dinner plan | Priya — routines and return |
| --- | --- | --- | --- |
| 1 | Skip optional setup; save a long thought; convert to one five-minute task; original body/backlink retained. | Two-serving recipe → four-serving plan; rice 200→400 g, source link and manual grocery; no food-consumption row. | Start UTC; explicitly confirm New York timezone; save three identified steps and one local-day completion. |
| 2 | Repeat conversion through scripted web conversation; one task; exact five-minute timer; persist paused timer at 240 seconds and reload. | Change plan to two portions; replay save; one derived row/ingredient and manual grocery retained. Advice-only mutation is denied. | Reorder steps via current saved lookup; retain identity/yesterday completion; today is incomplete with zero completion count. Request/replay weekday reminder; saved cadence/zone verified. |
| 3 | Resume the same paused focus; complete task; undo once. Advice-only rename is denied; saved title/status checked. | Swap recipe snapshot; old lemon need disappears; shopping off removes derived rows, on restores current quantities. | Captured weekday occurrence advances next date; unrelated web interruption; lookup+snooze exact pending reminder; DONE leaves completed history. |
| 4 | Save Friday 3 PM task and separately request Friday 2 PM text; replay each receipt; one task/reminder/pending delivery job at distinct UTC instants. | Mark rice purchased; no pantry row appears. Explicit 100 g pantry stock reduces rice need; unknown garlic stock makes no guessed deduction. | Cancel completed reminder; separately request another text; disable proactive check-ins without cancelling it. Persist a synthetic busy-calendar interval and read calendarBusy; quiet boundary and busy deterministic gates are checked. |
| 5 | Capture one fake send and suppress duplicate. Move the delivered original through the existing reschedule command: one clearly explained fresh occurrence, unchanged sent record and duplicate-ingress protection. | Manually log actual eaten portion; planned meal remains separate. Known calories total 200; unknown fiber remains null/missing, not zero. | STOP → leave-me-alone → website reconsent → invitation change/back-off retains opted-out state. No pending welcome, inbound-coaching, evaluation or intervention work escapes suppression. |
| 6 | Completing project task leaves explicit follow-up scheduled; cancel it. Remove first linked task; thought shows abandoned identity; reconversion is rejected. | Copy food to next date at half portion; correct current copy through scripted web lookup/patch. Stale and other-account edits fail. | Explicit inbound START re-enables account; new activated browser-session service resolves same account. Hide progress numbers; remove the selected incorrect memory only; conversation-message count remains unchanged. |
| 7 | Correct note title; current retrieval returns correction. Foreign edit denied. Private feedback submit/retry yields one receipt; outsider cannot retrieve it. | Retrieve original older diary date unchanged and current corrected copy; exactly two manual consumption records; calendar remains disconnected and no external catalog call occurred. | Save optional workout plan/manual workout log; scheduled workout task stays incomplete. Routine IDs and prior completion provenance remain intact. |

## Original acceptance gaps and observed behavior

### Maya delivered reminder rescheduling — resolved in code-path acceptance

The original run observed “I couldn’t find an editable reminder with that description” and an unchanged sent row. Root authorized a service/repository fix rather than redefining the scenario. The final Maya test now performs the original delivered-ID `reschedule_reminder` after an unrelated message, requires the production service's explanation and checks the new scheduled record while preserving the original sent timestamp. Replaying its inbound receipt creates no additional reminder/job. The explicit unmet TODO was removed only after this desired-behavior test passed.

Implementation: an owned sent one-time reminder creates a distinct one-time row with the same text/content mode/task link/saved timezone. The transaction checks current messaging permission, serializes the inbound source, and saves a fingerprint/result in the existing account-owned receipt table. The new delivery action and durable receipt link old/new reminder IDs; the receipt survives completed-job trimming until account erasure. Scheduled/failed updates retain their normal behavior. Cancelled/completed/sending targets and terminal legacy recurring rows are not revived; mixed sent/pending batch edits fail atomically without creating partial follow-ups.

The nearest dedicated integration suite verifies concurrency/replay, original row/message preservation, new delivered-message reply target, provenance after completed-job trimming, changed replay, account/consent/paused-until denial, ownership/source/future validation and terminal/batch safety. A separate standard `AnthropicTaskIntentParser` mock regression exercises list → existing reschedule tool → canonical confirmation after an interruption. No prompt or tool-schema patch is used, and no live model/provider request is claimed.

### Combined task-time and reminder language — not certified

The Maya case uses the supported two-surface workflow: a web task save at 3 PM and a separate explicit reminder request at 2 PM. It verifies no reminder from task scheduling alone and independent saved timestamps/receipts. It does not certify a live parser's handling of the single combined sentence from the original matrix, or an atomic mixed write with distinct task/reminder times.

### Other limits and minor copy

- Luis's existing generic ingredient label is `2 lemon`; unit arithmetic/source links are correct, but arbitrary ingredient-noun pluralization is not supplied by `ingredientLabel`. No UI copy/source change is claimed.
- Manual food works without any catalog/camera request. Actual denied-camera/browser permission handling is not exercised; no permission dialog or rendered UI is present.
- Priya's quiet/busy acceptance is deterministic signal/gate testing with a persisted synthetic busy interval, not real Google OAuth/calendar behavior. STOP checks durable ingestion/suppression and pending work; no worker dispatch/carrier receipt is claimed.
- Browser-session persistence uses WebSessionService, not browser navigation. Reloads reread durable state within the same isolated database; this is not process-restart or production-persistence evidence.
- Semantic authorization, live AI quality, natural clarification across interrupted conversations, actual carrier delivery, browser/phone rendering and keyboard/clipboard behavior remain separate acceptance gates. No scores are assigned from scripted output.

## Validation

The final scenario command above passes its three executable tests, including the corrected delivered-follow-up path. `npm run lint` passed, and final file-scoped ESLint passed after the last fixture changes. An initial file lint preference was corrected. `npm run typecheck` was run raw: its first result reported only concurrent `ai-budget-attestation.ts` literal-type errors, not these files; final retry result is recorded below when available. Root owns integrated full-check/release validation.

Final `npm run typecheck` retry passed (exit 0) after the concurrent attestation fix. No typecheck pass was claimed for the earlier failing run.


Delivered-follow-up fix validation: `npm run test -- src/server/testing/delivered-reminder-followup.integration.test.ts src/server/domain/reminder-service.test.ts src/server/testing/first-week-acceptance.integration.test.ts` passed 3 files / 18 tests. The normal-parser reminder-week suite passed 8 tests. An initial standard-parser mock had an unnecessary second ACK response queued and was corrected; this was a fixture issue, not a production change. An initial new unit mock omitted required listForRundown; it was corrected and raw typecheck rerun passed. Final nearest-suite and independent review results will be appended when complete.


Final cohesive delivered-follow-up validation: the nine nearest reminder/service/week/reply/capture/batch suites passed **9 files / 52 tests**. Full `npm run lint`, raw `npm run typecheck` and scoped `git diff --check` passed. The duplicate-call race in the new follow-up suite is concurrent Promise execution against isolated PGlite, not independent-client PostgreSQL concurrency evidence. Independent review is separately checking source-ID aliases/mixed-operation retries before root's integrated check and final handoff.


Independent review follow-up: a separate reviewer reproduced normal duplicate submission with two real PostgreSQL pools (20 update calls yielded one follow-up/receipt and unchanged original sent data/message/job) and found two raw same-source aliases outside the parser's one-write contract. The fix now returns conflict when a sent-follow-up reuses a source that already created a reminder or edited another target, rather than throwing a uniqueness error or returning that other edit. New regular-update action payloads retain the request fingerprint, and invalid Date input fails before fingerprint serialization. New regression verifies no row/job changes on these conflicts. Post-hardening targeted service/new-integration/three-week run passed **3 files / 19 tests**. Generalized multiple independent writes from one inbound remains unsupported by the production parser; this localized fix does not broaden creation semantics.


Post-hardening existing reminder-week, safety, batch-cancellation and reply-link suites passed **4 files / 24 tests**. Final full lint, raw typecheck and scoped diff checks passed. The independent reviewer reran the current code using two fresh real PostgreSQL pools: 20 duplicate calls created exactly one follow-up and receipt, preserved original history and erased cleanly with account deletion; both source-alias guards returned conflict. These real-PostgreSQL results are attributed to the independent review, not this author's PGlite run. Root owns the integrated full-check/release decision; no deployment/provider authorization is implied.


## Lock-order review reopened

A later controlled two-client PostgreSQL probe with actual callers found a deadlock missed by the first review: owned inbound source → target reminder → account competed with authenticated cancellation's account → target reminder. A second actual probe found outer owned source → account versus account deletion's account → cascading source deletion. Both produced SQLSTATE 40P01. Earlier passing duplicate-race evidence did not cover these interleavings; prior review approval is superseded pending their repair and rerun.

The repository now locks the account before its source/target and removes the late account lock. The outer ownership transaction also needs a narrowly scoped account-first option for short reminder mutation transactions; model/provider work must not run under that account lock. Root coordination and controlled reruns are in progress. No final concurrency approval is claimed at this checkpoint.

## Lock-order repair and final focused evidence

The outer `executeCommand` reminder-write transaction now requests the optional `accountFirst` ownership mode, locking the owned account before the inbound source. The repository then uses that same account → source → reminder order. Other ownership calls retain their existing behavior; read-only commands return before this write boundary. Authorization and parser awaits precede the mutation, its canonical reply is persisted inside the short SQL transaction, and SMS submission follows its commit. The SQL-only capture-with-reminder command shares this reminder-write boundary. This is not a claim of global lock ordering for unrelated operations.

Independent reviewer `c1_ledger` reran both controlled actual PostgreSQL cases successfully with the final option: concurrent authenticated UI cancellation plus delivered-follow-up creation both fulfilled, and concurrent actual account deletion plus follow-up creation both fulfilled. `pg_blocking_pids` confirmed real waiting; neither produced SQLSTATE 40P01. The retained executable regression is `qa/pilot-2026-10-22/delivered-reminder-lock-race.mts`, run with `npx tsx qa/pilot-2026-10-22/delivered-reminder-lock-race.mts` and the same command with `--delete`. It uses fresh owned loopback databases, actual outer ownership/repository/UI/account-control callers, two clients and explicit cleanup. These PostgreSQL results are attributed to that independent reviewer, not this author's PGlite runs. See `delivered-reminder-review.md` for the reviewer evidence and limits.

Author validation after the lock repair: the delivered-follow-up, three-week acceptance and inbound-reliability suites passed **3 files / 21 tests**. The new `reminder-ownership-boundary.integration.test.ts` passed **1 file / 1 test** after its final fixture correction. It checks persisted create/reschedule records, that task/read-only calls do not request account-first ownership, and that parser, authorization and synthetic SMS awaits run outside that boundary. Its first transport spy used an unavailable mock implementation, corrected by binding the real synthetic transport before spying; its later reschedule addition initially lacked the explicit scripted authorization grant, which was corrected without changing production semantics. Raw `npm run typecheck`, full `npm run lint`, final test-file ESLint and scoped `git diff --check` passed. These are provider-free scripted fixtures, not observed live AI or carrier behavior. Root owns the integrated check and release decision; live/provider/deployment gates remain unchanged.
