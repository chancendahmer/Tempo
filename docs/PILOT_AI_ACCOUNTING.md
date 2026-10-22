# C1: AI accounting and pilot rollout contract

Reviewed October 22, 2026. Implemented on the adaptive candidate; **not enabled or deployed to production**. This controls model and hosted-search requests made by Tempo, not carrier, hosting, Calendar, food-provider or other applications' charges.

## Boundary and admission

All five server AI adapters use `paid-invocation.ts`. Trusted account/execution scope comes from the claimed inbound turn or the selected owned background record, outside model prompts. Each physical request, parser continuation and worker retry gets a new attempt. The enforced boundary snapshots the request, requires the direct Anthropic API, disables SDK retries and forces the standard service tier. A source regression detects a new direct paid SDK/API call outside the boundary.

`AI_BUDGET_MODE=off` preserves existing deployment behavior. Only exact `enforce` enables accounting; another value denies AI. All four integer caps and the current price-version string must be supplied. Invalid AI policy does not break STOP/privacy ingress. No pilot caps or new expenditure have been approved by this implementation.

One USD is 1,000,000 microdollars. Cap settings are exact nonnegative integer strings:

- `AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS`
- `AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS`
- `AI_BUDGET_GLOBAL_DAILY_CALLS`
- `AI_BUDGET_ACCOUNT_DAILY_CALLS`

Windows are UTC admission days, not customer-local routine days. Every reservation includes unsettled commitments from older days. Settlement is attributed to its original admission day. An older clock cannot rewind admission counters. Submitted calls count even when their authoritative cost is zero.

## Versioned pricing assumptions

Snapshot: `anthropic-standard-2026-10-22-v1`, valid from October22 until **November22,2026 00:00UTC**. Review or expiry intentionally stops new enforced calls. Only the following pinned IDs are supported; aliases/newer models are denied until separately priced and tested. This is compatibility support, not a recommendation to migrate to these models.

| Direct standard model | Input / million | Output / million | 5-minute cache write / million | 1-hour write / million | Cache read / million |
| --- | ---: | ---: | ---: | ---: | ---: |
| `claude-haiku-4-5-20251001` | $1 | $5 | $1.25 | $2 | $0.10 |
| `claude-sonnet-4-5-20250929` | $3 | $15 | $3.75 | $6 | $0.30 |

Source: official [Haiku4.5 specifications](https://platform.claude.com/docs/en/models/haiku-4-5/overview), [Sonnet4.5 specifications](https://platform.claude.com/docs/es/models/sonnet-4-5/overview), and [provider pricing](https://platform.claude.com/docs/en/about-claude/pricing), inspected October22. Both model specifications list a 200,000-token context and 64,000 maximum output. Sonnet4.5 is deprecated; any future model replacement needs its own snapshot/validation, not an alias change.

The [web-search documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) lists $0.01 per search plus model tokens, with search results counted during server iterations. The supported tool is only `web_search_20250305`, with explicit `max_uses` of one or two. Other hosted tools and dynamic filtering are unpriced and denied.

The conservative request envelope uses the full 200,000-token context for each sampling iteration, the requested output bound for each iteration, the most expensive supported cache-write rate for all input, and every allowed search fee. A normal request reserves one iteration. A search-enabled request reserves **ten**, using the provider's documented **default** per-request server iteration limit in [pause_turn semantics](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#pause_turn). No iteration override, context extension, thinking, compaction, image/document input, fast mode or nonstandard service tier is admitted. This is a versioned provider-contract assumption, not an immutable invoice guarantee. Reverify it before enabling and whenever the provider changes behavior.

The [token-counting API](https://platform.claude.com/docs/en/build-with-claude/token-counting) describes counts as estimates. This gate therefore does not substitute character counts or token estimates for a maximum. No extra preflight API is called.

Examples at the parser's 1,400 output setting: Haiku reserves $0.407 without search and $4.09 with search; Sonnet reserves $1.221 / $12.27. These are temporary conservative reservations, **not expected per-message costs**. Authoritative settlement normally returns unused headroom. Small daily caps can therefore reject inexpensive requests for lack of reservation headroom. Measure before choosing operating caps; never silently raise them to pass a test.

Supported input/output/cache/search usage is validated and priced with integer rates, rounding upward once to a microdollar. Cache totals must match their TTL components. Output subcategories are not charged twice. Missing or unknown billing components remain uncertain. A known cost or component bound violation is recorded without clamping and atomically halts further admission, including already reserved attempts that have not claimed submission.

## Transaction and recovery rules

Migration0033 adds budget state and attempt tables. Reservation locks global then account state and checks money and call caps in one short transaction. Claim allows exactly one `reserved → submitting` transition. Independent accounting transactions use the shared PostgreSQL pool but bypass domain transaction/savepoint scopes; a later business rollback cannot erase incurred provider debt. No provider network call runs inside the accounting transaction.

Lost responses, timeouts, cancellation, malformed usage and unavailable settlement retain the entire commitment. Crashes can leave reserved/submitting rows; age, restart, lease expiry and midnight do not release them. The read-only operations report flags stale/uncertain debt and mismatched counters.

`reconcile` is an operator-only repository primitive, not a customer/model tool or automatic job. An independent audit must provide authoritative cost/usage and a reconciliation UUID. Repeating the same audit is idempotent; conflicting replays are rejected. Only a never-claimed reservation can be reconciled as definitively unsubmitted with zero cost/usage. Claimed attempts may already be billable. There is deliberately no automatic halt reset or speculative refund CLI.

The ledger contains opaque identifiers, fixed categories, numeric usage and version metadata. It stores no prompts, responses, tool data, URLs, phone numbers, keys, headers or raw provider errors. Account deletion removes foreign-key links, while opaque hashed account keys and numerical debt remain to prevent a deletion from refunding spend. **Before first-ten rollout, approve and disclose this non-content accounting retention policy and its retention period.** No automated purge is shipped; never purge unresolved debt. This is an explicit remaining gate, not a claim of permanent anonymous-data retention approval.

## Customer behavior

Budget denial does not authorize a write. Authorization remains uncertain; unperformed actions are not claimed as saved. Confirmations for an earlier verified durable write survive a denied later synthesis call. Optional task presentation/composition has deterministic fallback. The lead's explicit policy choice is that an AI-review budget denial vetoes proactive intervention; ordinary pre-existing provider-failure fallback remains unchanged.

STOP, HELP, pause, carrier suppression and authenticated deterministic cancellation remain independent of accounting. Already scheduled reminder delivery does not require a new model call. Fixture tests cover zero caps and a failing accounting constructor, while the normal PostgreSQL ingress/ownership requirements still apply.

## Rollout and rollback gates

1. Reconcile the historical **aggregate $10 test budget** before any paid canary. This implementation spent $0 and grants no fresh balance.
2. Approve daily global/account money and call caps, reservation headroom, retention and operator reconciliation ownership. Verify an independent provider cap/alert where available.
3. Apply0033 through the normal shared advisory-lock migration runner. The migration is additive, with SETNULL account foreign keys and matching schema snapshot. Existing code can ignore the tables.
4. Verify every AI-producing web/worker deployment has the same intended pinned model, price snapshot, enforced mode and caps. Current worker attestations do not prove AI-budget configuration. The operations report intentionally returns `enforcementVerified:false` and null headroom; do not call that a rollout pass.
5. Reconcile an authorized live model/search canary against provider billing. Synthetic accounting races and mocked usage do not verify an invoice or live tool continuation. A deferred `pause_turn` search continuation still needs live validation; the existing parser may remove a tool after counting unresolved visible calls.
6. Complete Q1 browser/accessibility/customer journeys and L1 SMS/Google/catalog, backup/restore, alert and rollback evidence before preparing release approval.

Rolling code back must preserve the ledger and additive schema. If old code does not meter, stop AI-producing workers/calls before that rollback; setting mode off is **not** a budget-safe rollback. Reconcile outstanding attempts before any intentional policy or halt change. No production deployment, migration or merge was performed in this package.

Evidence: `qa/pilot-2026-10-22/c1-budget-race.json`, `c1-independent-review.md`, `w2-reminder-clarity.md`, `w2-browser-review.md`, and the final integrated checkpoint recorded in that directory's README.
