# C1: AI accounting and pilot rollout contract

Reviewed November 10, 2026. The adaptive candidate meters Tempo model and hosted-search requests. The dated verification and rollout status are below.

## Boundary and admission

The five primary AI adapters and the isolated hosted-search adapter use `paid-invocation.ts`. Trusted account/execution scope comes from the claimed inbound turn or the selected owned background record, outside model prompts. Each physical request, search continuation and worker retry gets a new attempt. The enforced boundary snapshots the request, requires the direct Anthropic API, disables SDK retries and forces the standard service tier. A source regression detects a new direct paid SDK/API call outside the boundary.

`AI_BUDGET_MODE=off` preserves existing deployment behavior. Only exact `enforce` enables accounting; another value denies AI. All four integer caps and the current price-version string must be supplied. Invalid AI policy does not break STOP/privacy ingress.

One USD is 1,000,000 microdollars. Cap settings are exact nonnegative integer strings:

- `AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS`
- `AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS`
- `AI_BUDGET_GLOBAL_DAILY_CALLS`
- `AI_BUDGET_ACCOUNT_DAILY_CALLS`

Windows are UTC admission days, not customer-local routine days. Every reservation includes unsettled commitments from older days. Settlement is attributed to its original admission day. An older clock cannot rewind admission counters. Submitted calls count even when their authoritative cost is zero.

## Versioned pricing assumptions

New admissions require `anthropic-standard-2026-11-10-v2`, valid from November 10 until **November 22, 2026 at 00:00 UTC**. The previous snapshot remains part of the historical ledger, including any outstanding commitments. Review or expiry intentionally stops new enforced calls. The allowlist contains the exact direct API IDs below.

An enforced v1 configuration on this candidate denies new AI requests until the web and worker deployments use v2 together. A v1-metered build rejects v2 configuration. The observed production baseline `86ae010` predates enforcement. Synchronize the reviewed build and price version across all AI-producing processes, then verify fresh attestations before admitting paid traffic.

| Direct standard model | Input / million | Output / million | 5-minute cache write / million | 1-hour write / million | Cache read / million |
| --- | ---: | ---: | ---: | ---: | ---: |
| `claude-haiku-4-5-20251001` | $1 | $5 | $1.25 | $2 | $0.10 |
| `claude-sonnet-4-5-20250929` | $3 | $15 | $3.75 | $6 | $0.30 |
| `claude-sonnet-4-6` | $3 | $15 | $3.75 | $6 | $0.30 |

Haiku 4.5 and Sonnet 4.5 support a 200,000-token context and up to 64,000 output tokens. Sonnet 4.6 supports a 1,000,000-token context and up to 128,000 output tokens at standard global rates. Enforced Sonnet 4.6 requests explicitly use global inference to avoid inheriting a workspace default with a regional surcharge. Verify that global routing is allowed for the intended provider workspace before enabling enforcement. [Haiku 4.5 specifications](https://platform.claude.com/docs/en/models/haiku-4-5/overview) · [Sonnet 4.5 specifications](https://platform.claude.com/docs/es/models/sonnet-4-5/overview) · [Sonnet 4.6 specifications](https://platform.claude.com/docs/en/models/sonnet-4-6/overview) · [Provider pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [Inference geography](https://platform.claude.com/docs/en/manage-claude/data-residency)

The [web-search documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) lists $0.01 per search plus model tokens, with search results counted during server iterations. The supported tool is only `web_search_20250305`, with explicit `max_uses` of one or two. Other hosted tools and dynamic filtering are unpriced and denied.

The conservative request envelope uses the model's full context for each sampling iteration, the requested output bound for each iteration, the most expensive supported cache-write rate for all input, and every allowed search fee. A normal request reserves one iteration. A search-enabled request reserves **ten**, using the provider's documented default per-request server iteration limit. The supported request uses standard service without iteration overrides, context extensions, thinking, compaction, image or document input, or fast mode. Reverify the provider contract before enabling and whenever provider behavior changes. [Pause-turn semantics](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#pause_turn)

The [token-counting API](https://platform.claude.com/docs/en/build-with-claude/token-counting) describes counts as estimates. This gate therefore does not substitute character counts or token estimates for a maximum. No extra preflight API is called.

At the parser's 1,400-output setting, Haiku 4.5 reserves $0.407 without search and $4.09 with two searches. Sonnet 4.5 reserves $1.221 and $12.27, respectively. Sonnet 4.6 reserves $6.021 and $60.23. Authoritative settlement normally returns unused reservation headroom.

The primary parser offers a custom client search tool. Its requests contain no hosted-search definition, so ordinary Sonnet 4.6 reads and writes reserve $6.021 per physical call. When search is needed, the parser validates the offered tool, current-message source quote and query schema. The outbound query must be an exact contiguous phrase from the current message, up to 400 characters. If a suitable public phrase exists only in history or saved records, Tempo asks for a public search phrase.

Only the search adapter offers hosted search, using pinned Haiku 4.5 with one search per physical request and a $4.08 reservation. It receives only the validated query. Account context and local mutation tools stay in the primary parser. Each turn shares a two-search allowance, a six-search-request ceiling and a 30-second search deadline. Paused requests retain their exact tool definition and assistant blocks. Unknown or failed submissions stop further search attempts. Successful evidence returns a bounded summary and source URLs that occur in both provider result blocks and citation metadata. Current-turn lookup facts and write authorization remain in the primary parser.

A pending search counts against the turn allowance. A second deferred search can therefore stop conservatively before completion when its unchanged one-search allowance cannot fit. The adapter reports that limit explicitly. Evidence clipped at its text bound carries a truncation flag and notice for the primary model.

Each search request settles before the next primary request reserves headroom. Sequential Sonnet, Haiku search and Sonnet synthesis can use the same hosted daily headroom after each settlement, subject to actual spend and outstanding debt. A denied search reports that current information could not be verified, alongside any already verified write confirmation. If synthesis fails after a successful lookup, Tempo retains the verified source links and explains that it could not finish the summary.

Supported input, output, cache and search usage is validated and priced with integer rates, rounding upward once to a microdollar. Cache totals must match their TTL components. Settlement accepts documented standard speed and requires global inference for Sonnet 4.6. The inclusive output total covers the known output breakdown fields. Missing or unknown billing components remain uncertain. A known cost or component bound violation is recorded without clamping and atomically halts further admission, including already reserved attempts that have not claimed submission. [Messages API response](https://platform.claude.com/docs/en/api/messages/create)

## Transaction and recovery rules

Migration 0033 adds budget state and attempt tables. Reservation locks global then account state and checks money and call caps in one short transaction. Claim allows exactly one `reserved → submitting` transition. Independent accounting transactions use the shared PostgreSQL pool but bypass domain transaction/savepoint scopes; a later business rollback cannot erase incurred provider debt. No provider network call runs inside the accounting transaction.

Lost responses, timeouts, cancellation, malformed usage and unavailable settlement retain the entire commitment. Crashes can leave reserved/submitting rows; age, restart, lease expiry and midnight do not release them. The read-only operations report flags stale/uncertain debt and mismatched counters.

`reconcile` is an operator-only repository primitive, not a customer/model tool or automatic job. An independent audit must provide authoritative cost/usage and a reconciliation UUID. Repeating the same audit is idempotent; conflicting replays are rejected. Only a never-claimed reservation can be reconciled as definitively unsubmitted with zero cost/usage. Claimed attempts may already be billable. There is deliberately no automatic halt reset or speculative refund CLI.

The ledger contains opaque identifiers, fixed categories, numeric usage and version metadata. It stores no prompts, responses, tool data, URLs, phone numbers, keys, headers or raw provider errors. Account deletion removes foreign-key links, while opaque hashed account keys and numerical debt remain to prevent a deletion from refunding spend. The candidate Privacy Policy `2026-11-10.v2` discloses this retention after account deletion and explains why unresolved charges remain recorded. New consent evidence uses that version. The product ships no automated purge or fixed retention period. Preserve unresolved debt through reconciliation.

## Customer behavior

Budget denial does not authorize a write. Authorization remains uncertain; unperformed actions are not claimed as saved. Confirmations for an earlier verified durable write survive a denied later synthesis call. Optional task presentation/composition has deterministic fallback. The lead's explicit policy choice is that an AI-review budget denial vetoes proactive intervention; ordinary pre-existing provider-failure fallback remains unchanged.

STOP, HELP, pause, carrier suppression and authenticated deterministic cancellation remain independent of accounting. Already scheduled reminder delivery does not require a new model call. Fixture tests cover zero caps and a failing accounting constructor, while the normal PostgreSQL ingress/ownership requirements still apply.

## November 10 verification and rollout status

The aggregate synthetic QA authorization was amended from **$10 to $20** in the
existing append-only journal. The original $3.021 unresolved provider reservation
and $1 carrier hold were retained. The cap applies to the aggregate verification
run. The founder separately approved an ongoing **$10 aggregate per UTC day**
for all accounts after this verification run. The $9 hosted test hold remains
in the test journal. On the final main rollout, set both hosted daily money
caps to 10,000,000 microdollars and retain 100 global and 60 account daily
calls. Keep v2 enforced mode on both services. Same-day settled usage remains
in the shared production ledger when those caps change.

One authorized live Sonnet 4.6 request passed the production metering code path
on an isolated local PostgreSQL database. The harness observed the **$6.000240**
reservation claimed before the request, exact settlement at **108 microdollars**
($0.000108), zero outstanding cost for that request and no attempt for the second
synthetic account. The disposable database was removed after verification. The
same request appears in the central QA journal and local production-mode ledger
and counts once against the authorization. At that point the central journal
recorded $3.401493 settled, $3.021 unresolved and the $1 carrier hold, or
**$7.422493 committed**. The private proof is
`qa/pilot-2026-11-10/private/live-transcripts/meter-a1631efc-d0e3-4c32-9999-16e36caaebad.json`.
The live proof ran locally. A subsequent one-request Haiku hosted-search probe
also passed the isolated adapter and production metering path on disposable
local PostgreSQL. It claimed a **$4.080000** reservation before transport, used
10,153 input tokens and 282 output tokens with zero cache usage and one search,
and settled **21,563 microdollars** ($0.021563) in both ledgers. The result cited
the NIST Internet Time Service page. The other synthetic account had no attempt,
and the probe database was removed. The retained aggregate proof is
`qa/pilot-2026-11-10/private/live-transcripts/meter-2b7ea762-a7c8-4f1a-8ae7-f2fcb1d5ef57.json`.
This exercises the adapter and ledger. Full primary-parser synthesis, a live
provider continuation, and provider invoice reconciliation are outside the scope of this artifact.
[NIST source returned by the adapter](https://www.nist.gov/pml/time-and-frequency-division/time-distribution/internet-time-service-its)

After the search the central journal recorded $3.881717 settled, the retained
$3.021 unresolved reservation and $1 carrier hold, or $7.902717 committed. The
lead subsequently recorded the **$9 hosted hold**, bringing commitment to
**$16.902717** of the $20 aggregate authorization. The held amount already
covers the bounded hosted test allocation. Invoice-console access is unverified.
Use authoritative usage, retained uncertainty and the hold for conservative test
accounting. Hosted deployment and carrier and Calendar acceptance remain separate.

The candidate is in controlled verification before release. The existing Railway services use the
normal shared migration runner for additive accounting migration `0033` and
subsequent migrations through `0035`. A restored PostgreSQL 18 clone passed the
exact migration and unchanged rerun. During controlled verification the existing
Railway services ran matching `c732093` builds with valid v2 policy and the
approved temporary $9 daily caps. Each service showed one active candidate
replica and the prior deployment Removed. Readiness returned HTTP 200 after
the approved historical disposition. After the real demo reminder arrived,
the 22:48:30 UTC operations snapshot recorded **$0.305388 settled across
eleven calls**, with zero outstanding cost and zero recorded violations.
Those calls fall within the previously held $9. A later actual hosted SMS
search returned NIST and time.gov links. The hosted ledger since 22:30 UTC
recorded one settled Haiku 4.5 search at **$0.022950**, with one authoritative
search request and zero outstanding cost. The slice also contained 12 settled
Sonnet calls. All 13 settled calls cost **$0.449789** within the held allowance.
The dedicated demo SMS and Calendar flows are recorded in the release audit.
[Hosted release audit](../qa/pilot-2026-11-10/release-audit-checklist.md)

Per-instance web and worker heartbeats report the five primary operation models,
the fixed hosted-search model, policy hash and caps, direct-provider host and
price expiry. `observedEnforcedConfiguration` describes fresh, consistent
registered instances. Missing, stale, mixed, malformed or expired evidence is
unknown. Confirm platform inventory and verified replica retirement separately.
The operations report retains `inventoryComplete:false`,
`enforcementVerified:false` and null headroom because it cannot inspect platform inventory.

Pause candidate paid calls by retaining `AI_BUDGET_MODE=enforce` and the v2 price
version with all four caps set to zero across the affected roles. Before
reverting to a build that lacks enforcement, stop paid ingress and workers.
Preserve the ledger and additive schema through code rollback and reconcile
outstanding attempts without replay.

Evidence: `qa/pilot-2026-10-22/c1-budget-race.json`, `c1-independent-review.md`, `c1-attestation.md`, `c1-attestation-review.md`, `w2-reminder-clarity.md`, `w2-browser-review.md`, and the final integrated checkpoint recorded in that directory's README.
