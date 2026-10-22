# C1 assignment: bound AI spend for the private pilot

Owner: one Sol 6.1 agent at medium reasoning for implementation, with Astra medium or the principal engineer reviewing the accounting design and final diff. Do not spawn agents or change models without the lead's assignment. Start from the approved pilot checkpoint and read AGENTS.md. This brief authorizes planning/implementation only when assigned; it does not authorize deployment, production migrations, provider calls or spending.

## Goal and boundaries

First make the ten-person pilot's **model and hosted-search** spend bounded across every worker/process, including retries and background jobs. Expand to 100 only after concurrency, failure and reconciliation evidence passes. User count is not a spend limit. This ledger does not cap SMS/carrier, hosting, Calendar or food-provider charges; the lead must verify those separately before claiming total pilot cost is bounded.

Use PostgreSQL as the only durable accounting system. Add no service/library by default. Preserve consent, opt-outs, quiet hours, calendar checks, cooldowns, confirmation gates, account isolation, chronological processing and ambiguous-send recovery. No model/prompt change or new product feature belongs in C1.

**The existing aggregate $10 live-test authorization/ledger is unreconciled.** No remaining balance is established. Reconcile prior live-test records before any separately authorized paid validation; do not treat this brief or the production budget as a fresh $10 allowance. `scripts/lib/live-qa-budget.ts` is a QA-only file-lock/fetch wrapper with hard-coded pricing assumptions, not a production accounting source.

## Paid-call audit to preserve

| Adapter path under `src/server/adapters/llm/` | Current paid boundary |
| --- | --- |
| `task-intent-parser.ts` | Up to six `messages.create` steps, 1,400 output tokens/request, 30-second SDK timeout, **maxRetries: 1**. Search is offered with at most two uses across a turn's observed continuations. A search-unavailable fallback can issue another step. |
| `turn-authorizer.ts` | Independent authorization request, 300 output tokens, 30 seconds, no SDK retry. This call precedes execution and needs its own reservation. |
| `intervention-decision-reviewer.ts` | 160 output tokens, 15 seconds, no SDK retry; preserves the existing deterministic reviewer fallback. |
| `intervention-composer.ts` | 140 output tokens, 15 seconds, no SDK retry; validates output and has a deterministic fallback. |
| `task-presentation.ts` | 650 output tokens, 15 seconds, no SDK retry. Background handler runs once/minute, one account/batch, at most eight tasks. Only this adapter currently exposes a basic input/output `onUsage` callback. |

These five are the current server AI SDK entry points. Re-run `rg` for `new Anthropic`, `messages.create`, `count_tokens`, hosted tools and usage callbacks before editing; classify SMS SDK matches separately. Cover web-originated assistant messages, since they enter the same worker path. Do not infer actual billable search/cache usage solely from visible response blocks or the two-search product limit: a lost response/hidden retry can already have incurred charges.

## Exact ownership and integration seams

- Add `src/server/adapters/llm/paid-invocation.ts`: one metered request boundary, explicit request/usage schemas, bounded retry policy and budget-denial result. Route every adapter above through it; prevent direct SDK/fetch bypasses in enforced mode.
- Add `src/server/domain/ai-budget.ts` and `src/server/db/repositories/ai-budget-repository.ts`: policy/types and atomic reservation, submission claim, settlement/reconciliation contracts. Domain code must not import an SDK or Next.js.
- Coordinate `src/server/db/schema.ts`, the **next available additive Drizzle migration**, journal and snapshot with the principal engineer. A2 owns `0032`; do not overwrite or invent its replacement. The integration owner applies migrations, never this task against production.
- Pass trusted, out-of-band account/execution scope through `src/server/jobs/handlers/process-inbound.ts`, `evaluate-context.ts`, `deliver-intervention.ts`, `task-presentation.ts` and `src/server/db/repositories/task-presentation-repository.ts`. Distinguish inbound message/action, operation, parser step and network attempt. Do not add those IDs to model prompts. Update authorizer/parser constructor contracts and nearest callers/tests coherently.
- Own the minimal cost fields in `src/server/config/env.ts`, `.env.example`, `src/server/observability/pilot-operations-report.ts` and their tests. Coordinate shared-file edits with the lead. Operator aggregates may expose usage/cost/confidence; public health must retain R2's boolean/count/build privacy boundary.
- Add focused `ai-budget` unit/integration tests, an isolated real-PostgreSQL concurrency test, and nearest adapter/handler regressions. Record evidence under `qa/pilot-2026-10-22/cost-control/`. Keep `scripts/lib/live-qa-budget.ts` separate; do not substitute it for the durable ledger.

## Decisions the lead must make before enforced rollout

1. Verify current official provider prices and billing semantics for the pinned model/version, input/output tokens, cache creation/read variants, hosted search and any token-counting/preflight endpoint. Save source URLs, verification date, currency, units and a price-version identifier. **No guessed/copied QA rates.** No web pricing lookup is needed to implement synthetic tests; verification is an explicit next step before enabling real calls.
2. Choose global/account monetary caps, per-account request/call caps, accounting window, initial cohort and treatment of optional proactive/background work on exhaustion. The $10 test cap is not a pilot cap. Approve whether the existing high-confidence reviewer fallback should remain available on budget denial; do not silently change its behavior.
3. Approve trustworthy input-token upper bounds/preflight and all priced request options, including cache/search. Decide the operational process for uncertain usage, provider overage discrepancies, price expiry and independently authorized reconciliation. A billing cap/alert at the provider is a separate verification, not something this code can claim installed.
4. Decide deployment rollout and rollback ownership. Confirm every AI-producing process in the pilot environment enforces the same policy; a cohort-only meter cannot claim a global provider-account cap while other accounts/jobs bypass it.

## Implementation defaults unless the lead changes them

- Default enforcement **off** to preserve existing deployments. Add explicit environment-wide pilot opt-in with validated policy/pricing; when enabled, all five call families, background work and retries require metering. Missing account scope, invalid/unknown price/model/options, exhausted cap or unavailable accounting DB denies the paid call. No silent unmetered fallback.
- Use integer cost units with documented scale and conservative upward rounding; avoid floating-point balances. Version policy/pricing on each reservation. Start with trusted UTC admission-time windows and retain outstanding uncertain commitments across rollover; never reset/refund them merely because the day changed.
- Keep pricing/config out of prompts. Use a provider request envelope with verified bounded input/output/search/cache allowances. A byte/character heuristic is not a proven token bound. Price token preflight itself if applicable; unknown preflight billing cannot escape the gate. Deny unsupported thinking, speed tiers, tools, cache options or new provider usage fields until priced and schema-supported.
- Preserve current request/model behavior where possible. When metering is enabled, set **all SDK maxRetries to zero**, including the parser, and perform any approved retry explicitly through a fresh reserved network attempt. Account for outer pg-boss retry, search fallback, validation/time repair and `pause_turn` continuations too. Never reserve only once for six physical requests.

## Required accounting protocol

1. Validate trusted scope, request bounds and a verified pricing snapshot before network activity. Compute a conservative maximum charge for **this attempt**, including permitted hosted work/cache/input/output. Do not hold a SQL transaction open during token preflight or provider requests.
2. In one short transaction, lock/update global and account budget state in a fixed order. Atomically check monetary **and** call/request caps, include outstanding unknown commitments, insert the unique attempt reservation and increment counters. Either both caps reserve or neither does; re-check at UTC rollover under the same global/account serialization.
3. Use a stable logical operation identity plus a unique physical network-attempt identity. Duplicate reservation/settlement replay must not double-charge. A compare-and-set `reserved -> submitting` transition gives one caller permission to send that attempt. Reusing a reservation must never grant a second caller another paid request.
4. Make the provider request outside SQL. A retry is a new physical attempt/reservation; no exactly-once billing claim is justified by a local key. If a process dies after claiming submission, treat it as potentially billable even if it might have died before the socket write.
5. Schema-validate the full supported usage record and model identity. Settle once atomically using authoritative input/output/cache/search components and the reservation's price version. Record actual-versus-reserved deltas; never hide a charge exceeding its bound. Stop further paid admission and require review if verified usage exceeds the conservative envelope.
6. On timeout, cancellation, network loss, malformed/missing usage or uncertain acceptance, retain the commitment and mark it uncertain. Do not auto-refund on lease expiry, job failure, restart, a new day or a guessed error category. Release only a definitively unbillable attempt under verified provider semantics, or an independently audited reconciliation. Repeated reconciliation must be idempotent.
7. Ledger fields are opaque internal account/execution IDs, operation/model/price versions, attempt/state/timestamps, numeric usage/cost and fixed failure categories. Store **no prompts, outputs, tool arguments/results, URLs, phones, headers, credentials or raw provider errors**. Keep account deletion/retention and aggregate audit requirements consistent with existing policy; do not silently retain identifying records after hard deletion. Deletion cannot refund provider-spend commitments: preserve anonymous aggregate debt under an approved retention policy.

## Product behavior under exhaustion

STOP/HELP, carrier suppression, consent revocation, pause and existing deterministic cancellation paths must run before/independently of AI metering. The monetary cap cannot prevent an account from stopping messages or canceling via its authenticated deterministic controls. Preserve provider/consent handling even when budgets or PostgreSQL cost tables are unavailable; existing durable ingress failure semantics still apply.

Budget denial is not write authorization. The authorizer must remain uncertain/fail closed; never skip classification and execute a model-proposed mutation to save money. Use truthful deterministic responses/available record operations; ambiguous cancellation still needs the existing owner/target checks and clarification or an authenticated cancellation control. A completed durable write must retain its truthful confirmation if later synthesis is denied. Denial must not create an endless retry loop, repeatedly notify the user, invent success, discard the inbound receipt or bypass deterministic outreach gates.

## Acceptance tests and execution order

1. Unit-test every priced usage component and rejection of unknown/missing/negative/overflow values, unsupported models/options and unverified/expired pricing. Use clearly synthetic prices only; verify rounding and exact-boundary arithmetic.
2. Real PostgreSQL: race at least 100 reservations across two independent clients/workers against one remaining global/account allowance; prove no oversubscription, deadlocks, lost updates or one-sided reservation. Test account isolation, independent account caps, windows and outstanding debt across rollover. Use a fresh run-owned local `_test` database and preserve shared fixtures.
3. Race duplicate reservation, send claim, settlement and reconciliation; assert one network permission/settlement per attempt. Inject failure before reservation, after reserve, after claim, after provider acceptance and before/after settlement; retain uncertain charges correctly and show a new retry cannot reuse already committed headroom.
4. Adapter mocks cover all five families, authorizer + parser multistep flow, SDK retry disabled, explicit retry denied at cap, hosted-search continuations, cache usage, malformed usage, DB outage, cancellation/timeout and background presentation. No real provider calls. Add a regression that detects any new direct SDK paid call outside the metered boundary in enforced mode.
5. Product regressions cover STOP/HELP/pause/cancel at zero budget, malformed budget config, owner isolation, no-write denial, completed-write confirmation, reminder delivery independent of model spend and no automatic retry storm. Verify no prompt/phone/token leaks in ledger, logs, reports or errors.
6. Run nearest suites, `npm run lint`, `npm run typecheck`, then the principal engineer's integrated `npm run check`. Report every failure and skipped environment gate. Produce a reviewable diff, migration/rollback notes, accounting invariants and a synthetic operator report; no commit/deploy unless separately assigned.
7. First-ten release gate: lead-approved verified pricing/caps, environment-wide enforcement, all call paths accounted, race/crash tests and sanitized report pass; any authorized live billing canary is reconciled before adding users. Keep the existing unreconciled $10 test ledger visible. Expand to 100 only after observed usage/uncertainty/headroom and operator review support revised caps; synthetic throughput alone cannot justify the spend envelope.
