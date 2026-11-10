# November 10 synthetic QA spending limit

The new authorization is **USD 10 total for this bounded synthetic QA run**. The lead owns paid submissions. This is separate from the October pilot accounting and does not authorize production, personal data, live SMS, Calendar writes, hosted tools or further budgets. Use the local assistant simulator with only synthetic inputs and captured transport.

Load configured model credentials with the existing normal environment loader outside this helper. Set `ASSISTANT_WEB_SEARCH_ENABLED=false`, `AI_BUDGET_MODE=off` and `ANTHROPIC_LOG=off` before loading the application environment or constructing a model client. Install the guard before constructing any SDK client, since the SDK captures `fetch` at construction. Await the entire paid workflow inside the callback.

```ts
await withLiveQaBudget(async budget => {
  // Load and construct the assistant inside this callback.
  await runSyntheticQa();
  console.log(JSON.stringify(budget.snapshot()));
});
```

Only direct nonstreaming Anthropic Messages requests are accepted. The guard rejects caller-supplied geographic routing, custom endpoints, redirects, betas, hosted tools, caching, thinking and unsupported service tiers. It forces standard-only service. It sends explicit global routing on Sonnet 4.6 because a workspace may configure a different default. Haiku 4.5 does not accept a geography override. The priced models and conservative input reservations are:

| Model | Input bound | Input per million | Output per million | Reservation |
| --- | ---: | ---: | ---: | ---: |
| `claude-sonnet-4-6` | 1,000,000 | $3 | $15 | $3 + max output at list price |
| `claude-haiku-4-5-20251001` | 200,000 | $1 | $5 | $0.20 + max output at list price |

The guard accepts at most 5,000 output tokens per request. Rates are the direct API standard list prices. [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [Sonnet 4.6 model limits](https://platform.claude.com/docs/en/models/sonnet-4-6/overview) · [Anthropic inference geography](https://platform.claude.com/docs/en/manage-claude/data-residency)

## Ledger and recovery

The fixed journal is `qa/pilot-2026-11-10/private/live-budget-10/`. It is ignored by Git. Keep it across all attempts under this authorization. Each physical request, including an SDK retry or a tool-loop continuation, has its own reservation. A file is flushed and atomically renamed before network submission. Settlement is appended in another immutable file. Startup validates and recomputes committed spend from all journal entries. Pending, transport-error, HTTP-error, and invalid-usage attempts retain their full reservations. A billing failure or unpriced response halts later admissions. A known usage overrun records the full actual amount and halts later admissions.

A held lock blocks another process. A killed process may leave the lock and one or more pending reservations. Before any recovery, the lead must establish that the owning process has stopped. Preserve the journal and unresolved debt. A leftover temporary file or invalid journal blocks admission for review. On Windows the event file is flushed before its same-directory rename. This is a process-crash guard and does not attest storage durability after a power loss or provider invoicing.

Only sanitized attempt metadata, provider status, allowed error type, billing category and token totals are stored. The guard neither reads credentials nor persists prompts, response text, URLs, cookies, headers or provider payloads. The committed amount is settled usage plus unresolved reservation debt.

## First canary and one reviewed probe

The first canary returned HTTP 200. Its usage did not match the strict schema, so the journal retains the full **$3.021** Sonnet reservation as unresolved debt and halts normal submissions. The original response was discarded and its exact usage cannot be recovered from this journal. The current direct Messages reference shows `usage.speed: "standard"`, which the installed SDK type omits. That is a plausible cause for the mismatch. The revised guard accepts only that documented speed and prices inclusive output totals once. Fast mode, nonzero cache and hosted tool counters, unexpected tier, geographic surcharge, and any other unknown usage field still halt. Failed usage validation now appends only bounded field names and allowlisted numeric cost counters. [Anthropic Messages response](https://platform.claude.com/docs/en/api/messages/create)

The lead can run the fixed diagnostic probe:

```powershell
node --import tsx qa/pilot-2026-11-10/live-budget-probe.ts '<existing runtime directory>'
```

The runner loads the same normal credentials, strips alternate SDK settings, and uses Sonnet 4.6 with a 16-token ceiling, no SDK retries, and one synthetic prompt. The guard pins the same request shape and appends a recovery authorization for exactly one physical request to the same locked journal. It checks the existing debt against the same $10 cap and leaves the original halt in force. The console emits a status and aggregate snapshot.

After independently reviewing an exact successful probe settlement, the lead can pass the original unresolved attempt ID and exact probe attempt ID to `withLiveQaBudgetReviewedContinuation`. The journal verifies the relationship, successful standard-tier settlement, and absence of other halts, then appends a continuation review event. The original $3.021 debt stays unresolved and fully committed. Normal admission under this authorization can proceed with that debt still counted. A failed or unknown probe, a second probe, or an unrelated later halt cannot authorize another continuation.

The lead's diagnostic probe settled **$0.000108** and the reviewed continuation retained the original hold. The subsequent nine-turn run finished with **$1.178748 settled** and **$4.199748 committed**. The follow-up cancellation canary brought the cumulative totals to **$1.508466 settled**, **$3.021 unresolved**, and **$4.529466 committed** before any carrier hold. The latter snapshot recorded 37 settled attempts, one unresolved attempt, and no pending attempts. [Independent semantic review](live-semantic-review.md)

## Dedicated demo carrier allowance

Before any carrier smoke test under this authorization, the lead runs:

```powershell
node --import tsx qa/pilot-2026-11-10/live-budget-carrier-hold.ts
```

This records one immutable **$1** hold in the same locked journal for unverified incremental demo SMS charges. The command sends no messages and loads no credentials. Repeating the command returns the existing hold. Anthropic admission counts the hold alongside settled usage and unresolved Anthropic debt. The authorization remains **$10 in aggregate**, with the carrier amount retained until reconciliation through a separately reviewed accounting process.

Run the provider-free checks with:

```powershell
node --import tsx --test qa/pilot-2026-11-10/live-budget.test.ts
```
