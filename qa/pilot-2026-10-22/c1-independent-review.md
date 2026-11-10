# C1 independent review — 2026-10-22

Reviewer authored W2, not C1. Review performed against the changing, uncommitted managed worktree. No C1 source edits, provider/model calls, production connections, migrations or deployment were performed by the reviewer. Root was still completing pricing, config and reporting during this review.

## Conclusion at this checkpoint

No confirmed accounting or enforcement defect was found in the ledger, invocation scope or metered boundary reviewed so far. This is not approval to enable enforcement: real PostgreSQL concurrency/crash evidence, final pricing evidence/tests, enforcement-specific privacy-control tests, operator reporting and integrated checks remain acceptance work.

An early suspicion that the outer invocation catch replaced asynchronous provider failures was withdrawn: returning the provider Promise without awaiting it does not route its rejection through that catch. Current source further separates admission setup from the request. That suspicion is not a finding.

## Source evidence inspected

- `docs/PILOT_COST_CONTROL_BRIEF.md`; `ai-budget.ts` and nearest tests; `ai-budget-repository.ts` and its PGlite integration tests; `ai-invocation-scope.ts` and tests; `paid-invocation.ts` and tests; all five adapter callers; inbound orchestration and proactive/presentation callers; schema accounting fields; deterministic messaging ingress and reminder delivery paths.
- Global-state row locking serializes mutations before account and attempt changes. Reserve updates global/account outstanding commitments atomically; conflicting attempt reuse is rejected. Claim performs a single reserved → submitting compare-and-set. Provider activity is outside the ledger transaction, using an independent database connection rather than domain transaction scope.
- Settlement compares duplicate actual costs and usage, removes the outstanding commitment once, records overages and halts admission. Rollover resets settled day counters while retaining outstanding money/calls; late settlement removes old debt without attributing it to the new admission day. Unclaimed and submitted reservations have no automatic timeout refund.
- Hard deletion sets account UUID foreign keys null and preserves global commitments. Ledger fields contain numeric usage, fixed operation/failure categories, opaque IDs and version/fingerprint metadata, with no prompt, result, phone, URL or raw provider-error fields. The remaining stable account hash/execution UUID are pseudonymous linkage, not a retention-policy approval; root/operator must approve anonymous-debt retention before rollout.
- Current metered invocation clones the admitted request, forces `service_tier: standard_only` and disables SDK retries for each physical call. Every invocation uses a fresh attempt UUID. Scope is AsyncLocalStorage metadata outside model input; inbound execution IDs are message IDs and proactive IDs are scheduled-action IDs. Presentation currently generates a fresh batch execution UUID; that gives unique accounting but does not group repeated attempts after a crash under one durable job identity.
- All five production AI SDK entry points use the boundary. The source regression checks direct `.messages.create` calls within the adapter directory. Every parser continuation/search fallback goes through the boundary again. Scope absence, admission failure, accounting outage or failed submission claim denies network activity. Usage/settlement failure retains debt. Network failure retains uncertain debt and existing adapter classification.
- STOP/HELP/pause run in deterministic ingress, authenticated cancellation runs in the workspace service, and reminder delivery does not invoke the AI boundary. Existing deterministic consent/outbound checks remain in place. Authorizer denial returns uncertain/no writes; reviewer budget denial vetoes outreach. Completed parser writes retain verified confirmation if later synthesis is denied.

## Tests actually executed

1. `npm run test -- src/server/domain/ai-budget.test.ts src/server/domain/ai-invocation-scope.test.ts src/server/db/repositories/ai-budget-repository.integration.test.ts`

   Passed 3 files / 15 tests. Covers integer contracts, independent scopes, exact caps, UUID canonicalization, duplicate reservation/claim/settlement, UTC rollover, outstanding debt, overage halt and deletion retaining commitments. This is PGlite, not two-client PostgreSQL race evidence.

2. `npm run test -- src/server/adapters/llm/paid-invocation.test.ts src/server/adapters/llm/task-intent-parser.test.ts src/server/adapters/llm/turn-authorizer.test.ts src/server/adapters/llm/intervention-decision-reviewer.test.ts src/server/db/repositories/task-presentation-repository.integration.test.ts src/server/domain/outbound-messaging.test.ts src/server/db/repositories/messaging-repository.integration.test.ts src/server/domain/reminder-service.test.ts`

   Passed 7 existing files / 187 tests. The requested task-presentation repository integration path does not exist; Vitest ignored that unmatched filter. No execution is claimed for that path. Tests include default-off provider behavior, independent network attempts/retry0, pre-network denial, uncertain network/usage/DB outcomes, direct SDK-boundary regression, completed-write confirmation, no-write authorization, reviewer denial, deterministic ingress/outbound and reminder-domain regressions.

3. `npm run test -- src/server/adapters/llm/task-presentation.test.ts src/server/jobs/handlers/deliver-reminder.test.ts src/server/jobs/handlers/deliver-intervention.test.ts src/server/jobs/handlers/evaluate-context.test.ts`

   Passed 2 existing files / 9 tests: task presentation adapter and reminder delivery handler. The deliver-intervention/evaluate-context test paths do not exist and were ignored; no execution is claimed for them. Reminder handler cases include pending/duplicate reconciliation and consent-related denial.

## Remaining acceptance work / actionable gaps

- Execute and retain the required real PostgreSQL race across at least two clients and 100 reservations, duplicate claims/settlement races, crash points and day rollover. A single PGlite connection cannot establish deadlock-free cross-process behavior.
- Finish/review the pricing tests and primary-source pricing/bound proofs, including cache variants, search sampling/continuations, unknown fields/model/tiers and expiry. The conservative full-context envelope was visible but its official-source proof and final tests were not yet available at this checkpoint. No live billing canary or prior $10 ledger reconciliation is claimed.
- Add/execute zero-budget and unavailable/malformed accounting controls using enforcement mode: STOP/HELP/pause, authenticated owner cancellation, explicit reminder delivery and denial without retry storm. Existing control suites pass, but do not themselves enable enforcement or inject a budget database outage.
- Supply sanitized operator aggregates for reserved/uncertain commitments, actual spend, halts and headroom before rollout; the report inspected initially did not yet include C1 ledger fields. Public health must retain its existing restricted shape.
- Confirm approved caps, identical enforcement on every AI-producing process, default-off rollout/rollback ownership, deletion/retention policy and reviewer budget-denial behavior. Budget accounting bounds AI/search only; SMS/hosting/catalog charges remain separate.
- Root owns final lint/typecheck/check and updated review of final pricing/report source. This review did not run or claim those integrated checks.


## Final review continuation — pricing and bound halt

The earlier checkpoint gaps above are historical. This addendum reviews the newly visible pricing module, bound-violation halt, real-PostgreSQL race artifact and operator report. C1 source remains unmodified by this reviewer.

### Independently checked primary sources

Opened the official pages below through the web tool on October 22, 2026, rather than relying on search snippets or third-party copies:

- [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing): Haiku 4.5 USD/MTok input/output/5m cache/1h cache/read = 1/5/1.25/2/0.10; Sonnet 4.5 = 3/15/3.75/6/0.30. These match the integer hundredths-of-microdollar rates in `ai-pricing.ts`.
- [Haiku 4.5 specifications](https://platform.claude.com/docs/en/models/haiku-4-5/overview) and [Sonnet 4.5 specifications](https://platform.claude.com/docs/en/models/sonnet-4-5/overview): the exact pinned IDs each list 200K context and 64K maximum output. Sonnet is deprecated and scheduled to retire November 30; the code's November 22 price expiry precedes that date. No model migration is included or implied.
- [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching): uncached input, cache creation and cache reads are distinct input buckets whose sum is total input. Charging separate 5m/1h creation buckets once and checking their sum matches the total is consistent with that accounting.
- [Web-search pricing](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool): USD10 per 1,000 searches plus token charges; retrieved search content counts as input during server iterations and later requests. The implementation reserves both token sampling and tool-request costs.
- [Stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#pause_turn): the documented default limit is ten server-side sampling iterations per request. This is a documented default, not an immutable provider billing guarantee. The admission allowlist permits no iteration override, dynamic filtering, compaction, media, thinking configuration or alternative server tools. Each client continuation reserves a fresh envelope. The ten-iteration assumption must be re-reviewed with the versioned pricing contract; calling `max_uses:2` a bound of two sampling iterations would be wrong.
- [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows): oversized input is rejected and cached prefixes still occupy context. The full 200K-context reservation therefore includes tool/schema/system overhead without a text/token heuristic or unmetered token preflight.

### Updated code assessment

The arithmetic is conservative for the supported request contract: each input token is reserved at the higher 1h cache-write rate, with one or ten full contexts and output allowances as applicable, plus the permitted search fees. Actual usage uses integer BigInt arithmetic and a single upward rounding to a microdollar. Unknown or missing supported usage, mismatched model, expired/unapproved pricing or unsupported request options retains debt through the boundary rather than guessing a refund.

`priceUsage` now sets `haltAdmission` if total input, output or search counts exceed their admitted component bounds, even if the cheaper actual mix stays below reserved money. The paid boundary forwards this into settlement. The repository stores `bound_violation`, compares it on duplicate settlement and sets global/account halted atomically. This closes the earlier distinction between a monetary overage and an envelope violation. Source review found no confirmed defect in this final path. The boundary test verifies flag propagation; the ledger should also retain a direct cheap-violation/replay-conflict regression.

Independently reran:

`npm run test -- src/server/adapters/llm/ai-pricing.test.ts src/server/adapters/llm/paid-invocation.test.ts src/server/domain/ai-budget.test.ts src/server/domain/ai-invocation-scope.test.ts src/server/db/repositories/ai-budget-repository.integration.test.ts`

Passed **5 files / 39 tests**, including all nine pricing tests, request snapshot/tier/retry safeguards, bound-violation propagation and existing ledger contracts. No real provider request was made by these tests.

### Newly supplied concurrency and operator evidence

Inspected `scripts/pilot-budget-race.ts` and `qa/pilot-2026-10-22/c1-budget-race.json`. The run uses two independent pools, an exact local PostgreSQL fixture and a freshly owned `_test` database; blocks external fetch; races 100 global reservations (10 accepted at exactly 1,000 microdollars), 100 duplicate reservations/claims/settlements (one claim and settlement winner, 99 settlement replays), then 200 account reservations (one winner per 100 accounts). The recorded final totals reconcile with zero outstanding debt and the owned database is reported removed. This is attributed evidence from the supplied run, not an independent rerun by this reviewer. It does not by itself inject every process-crash point or uncertain-cost rollover race; those remain distinct from the passing PGlite rollover/failure tests.

The new `ai-budget-report.ts` was inspected: it reads numeric/string aggregates, fixed problems/actions and sanitized version identifiers; reports outstanding/uncertain/stale commitments, violations and counter mismatch; and deliberately returns enforcement unverified and headroom unknown. It neither leaks account/request content nor pretends deployment-wide caps are attested. Report-specific tests and enforced control fixtures were still being authored at this addendum checkpoint.

Release remains blocked on approved live caps/policy, deployment-wide enforcement attestation, independently authorized/reconciled provider validation, the unreconciled prior $10 live-test ledger, final controls/report tests and root's integrated check. Passing synthetic races do not establish a total pilot spend cap or prove SMS/hosting/catalog charges are bounded.


### Later final-suite checkpoint

The cheap component-violation ledger regression is now present and passing: a one-microdollar actual charge below a ten-microdollar reservation with `haltAdmission:true` sets both halt flags, prevents an already reserved claim and next-day admission, replays once, and rejects a changed replay flag. Report unit/integration tests are also present and passing, including old-schema detection, read-only transaction enforcement and exclusion of private account/fingerprint/phone/worker metadata.

Independently reran:

`npm run test -- src/server/adapters/llm/ai-pricing.test.ts src/server/adapters/llm/paid-invocation.test.ts src/server/db/repositories/ai-budget-repository.integration.test.ts src/server/observability/ai-budget-report.test.ts src/server/observability/pilot-operations-report.test.ts src/server/observability/pilot-operations-report.integration.test.ts`

Passed **6 files / 45 tests**. This supersedes the pending pricing/report and direct cheap-violation regression items above. Source and executed tests still reveal no confirmed C1 accounting defect. Enforcement-specific zero-budget/DB-outage product fixtures were still being completed by the invocation owner at this checkpoint.

An existing search-continuation limitation was identified from the official [server-tools continuation rules](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools): deferred server calls require the same tool definition in the next request; an omitted waiting server tool is rejected. The parser currently counts visible server-tool calls toward its two-search turn limit and removes the tool at two, including a possibly unfinished `pause_turn` call. The existing mock regression expects tool budgets `[2,1,undefined]`, and does not emulate provider validation of a pending call. This may yield a failed continuation/retained uncertain commitment. It is not a C1 spend escape: official documentation says the missing tool causes validation failure, and the metered boundary retains debt. No C1 source or model behavior was changed to address this pre-existing availability limitation.


### Final control-independence verification

Independently inspected the final fixtures in `messaging-repository.integration.test.ts` and `deliver-reminder.test.ts`, then ran:

`npm run test -- src/server/db/repositories/messaging-repository.integration.test.ts src/server/jobs/handlers/deliver-reminder.test.ts src/server/adapters/llm/paid-invocation.test.ts`

Passed **3 files / 35 tests**. The new fixtures explicitly enable enforcement with zero monetary/call caps and, separately, an accounting-constructor outage guard. They verify STOP persists opted-out status, HELP queues compliance, pause persists, a newly activated authenticated session can cancel its saved reminder, and an existing reminder still follows the delivery handler. The accounting guard is never accessed by these paths. Reminder delivery uses mocks, not an SMS provider or actual pg-boss dispatch. These results supersede the earlier pending zero-budget/DB-outage control-fixture item.

**Final independent conclusion:** no confirmed C1 accounting/security defect found in the reviewed final sources and passing focused suites. Real PostgreSQL race evidence was reviewed and attributed; official price/context/default-iteration sources were independently opened; pricing, boundary, ledger, sanitized reporting and deterministic control suites were independently rerun. The existing deferred-search availability limitation is recorded above. Final integrated checks and release authorization remain root-owned; no live caps, deployment attestation, provider billing canary, prior $10 reconciliation or total pilot-cost guarantee is established by this review.
