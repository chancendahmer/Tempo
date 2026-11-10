# L1 live-test budget reconciliation — 2026-10-22

**Result: not fully reconciled. No remaining paid-test allowance is established.** This is a read-only forensic review of local metadata against the original aggregate US$10 live-test cap. It is not a new authorization, a reset of that cap, a provider invoice reconciliation, or pilot-budget approval.

No provider console/API, network call, populated secret file, production account, or new paid test was used for this review. The existing ledger was not modified. Only numeric/usage metadata and accounting documentation were inspected; no prompts, outputs, phone numbers, credentials or action tokens are reproduced here.

## Recorded amounts

| Evidence | Recorded amount, USD | Treatment |
| --- | ---: | --- |
| `qa/release-2026-10-15-live/cost.json`, `spent` | 5.547330 | Sum of the 132 successful ledger rows, counted once. This is the file's token-price estimate, not a verified invoice total. |
| Same file, `committed` | 5.730615 | Includes the successful-row sum and the existing unknown-outcome commitment. Do not add this to `spent`. |
| Difference: committed minus spent | 0.183285 | Remains unresolved. No refund or actual-charge inference is justified by these records. |
| `qa/adaptive-home/live-model-result.json` and `qa/adaptive-home/README.md` | 0.007158 | One separately recorded presentation call at `2026-10-21T23:22:10.729Z`; 1,236 input / 230 output tokens, `claude-sonnet-4-6`. README explicitly calls its cost an estimate. |
| **Visible-record spend-estimate subtotal** | **5.554488** | 5.547330 + 0.007158; not a complete or authoritative aggregate spend total. |
| **Visible-record carried-commitment subtotal** | **5.737773** | 5.730615 + 0.007158; preserves the unresolved 0.183285. Not proof of remaining headroom. |

The presentation usage tuple is absent from the 132-row ledger, and its timestamp follows the October 18 continuation described in `qa/customer-review-2026-10-18/README.md`. It is treated as an additional recorded estimate rather than a second copy of an old cumulative snapshot. Its returned usage implies the README amount under that artifact's stated historical rates: `(1,236 × 3 + 230 × 15) / 1,000,000 = 0.007158`. This arithmetic does not independently validate those prices or provider billing components.

The old ledger's `cap: 7` is its local run guard within the original US$10 aggregate authorization. It is not an additional US$7 budget.

## Double-counting checks

- `qa/release-2026-10-15-live/local-web-message-proof.json`, `note-proof.json`, `reminder-create-proof.json`, `reminder-edit-proof.json` and the three `web-message-*.json` artifacts contain cumulative budget snapshots. They are not new spend amounts to sum.
- Two proof pairs repeat the same cumulative snapshots: `reminder-edit-proof.json` and `web-message-07c8ccff-bd9d-492d-817f-bf1b716e982d.json`; `local-web-message-proof.json` and `web-message-8e4a7038-1c43-4711-a16d-3ae20ef9a63d.json`.
- `web-message-69dfee07-3da4-4a43-89fe-2ea4342ef792.json` repeats the final 5.547330 / 5.730615 ledger totals.
- The October 18 continuation's 0.189555 in `qa/customer-review-2026-10-18/README.md` is already included: its prior cumulative spend snapshot is 5.357775 and the final is 5.547330. Adding 0.189555 again would double-count it.
- The inspected later UI-pass records under `qa/ui-polish-2026-10-18`, `qa/journey-world-2026-10-19`, `qa/section-polish-2026-10-19` and `qa/tiimo-refinement-2026-10-19` explicitly report zero assistant/provider test spend. Those statements are scoped pass reports, not proof that every process/provider charge over the full authorization interval was captured.

## Accounting limitations found

1. **Unresolved commitment:** 0.183285 has no successful usage/settlement entry or independently audited disposition. Documentation calls it an unknown network outcome; this review does not establish whether it was billed, partly billed or unsubmitted.
2. **Incomplete attempt identity:** the ledger has 132 rows but only 130 distinct `call` numbers. Numbers 77 and 89 are absent; 105 and 106 each occur twice with different usage/cost metadata. The successful rows still sum exactly to 5.547330. Repeated call numbers cannot safely be deduplicated, and the gaps do not prove a particular count of uncertain physical attempts.
3. **No authoritative per-attempt linkage:** the old ledger rows contain only call number, status, input/output counts and estimated amount. They lack execution timestamps, provider request/billing identifiers, price versions and complete usage components. Identical token counts or costs also cannot serve as unique request identities.
4. **QA wrapper is not a complete billing source:** `scripts/lib/live-qa-budget.ts` uses historical hard-coded model/token prices and an input-count preflight. It saves the commitment before the network request but appends the ordinary row after a response. A lost response/process can therefore leave a commitment without a complete attempt record. Restarting its counter from `prior.ledger.length` is consistent with non-unique call numbering; it does not resolve the missing network outcomes.
5. **Later estimate is not consolidated:** the presentation artifact reports basic input/output usage and a model name, with an estimated amount documented separately. It has not been folded into the old ledger or independently matched to provider billing.
6. **Completeness across the original cap is unproved:** the available artifacts do not establish a complete ledger across all agents, processes, providers, retries, any preflight billing, hosted work, or charges outside the recorded runs. Separately scoped asset-generation accounting is not reconciled by these assistant-test records.

## Proof required to close L1

- A complete, independently obtained provider usage/billing record covering the original authorization interval, matched to all authorized paid test runs and physical attempts without counting cumulative snapshots twice.
- An audited disposition for the 0.183285 unknown commitment, using evidence of actual charge or definitive non-submission; documentation or arithmetic alone cannot release it.
- Attribution of ambiguous/duplicate call numbering to stable request/run identities, including hidden retries and missing outcomes, plus reconciliation of relevant input/output/cache/hosted-tool/preflight billing under the rates that applied at execution.
- Consolidation of the separate 0.007158 presentation estimate and confirmation that no other paid runs or provider components are missing.

Until that proof exists, retain the unknown commitment and treat the original aggregate US$10 ledger as unreconciled. Historical documents that subtract 5.730615 from US$10 are snapshots predating the later recorded estimate and are not a current spending authorization or established available balance.

## Independent continuation: pinned sources and record-universe limits

A second read-only aggregation on 2026-10-22 reproduced the amounts above using integer micro-USD (one millionth of a dollar), avoiding floating-point snapshot differences. No provider request or production access was performed. No original ledger, proof artifact, or product source was changed.

| Pinned evidence, SHA-256 of exact file bytes | Digest |
| --- | --- |
| `qa/release-2026-10-15-live/cost.json` | `ad87d780f76108697cf7ee66610bd3fc973cb9c6695c9c041e514abcf0900820` |
| `qa/adaptive-home/live-model-result.json` | `cd37ad9add8d3e1948b2ab1053ab668edb8a0a9a09f6bafb5f47262241752218` |
| `scripts/lib/live-qa-budget.ts` | `0e9a919e6fd46e2d4d7289e287eba63c34a7ef0d457955beec4e4cb2f76d4447` |
| `qa/adaptive-home/live-task-presentation.ts` | `ad5abea3f14c1620702dfa0b39ef683218041606f20c61589d205ebfa91819b3` |

These digests pin the inspected local versions; they are not provider attestations or proof that the current scripts exactly match every historical execution.

The 132 successful ledger rows contain **1,797,895 input and 10,243 output tokens**. Their recorded `actual` amounts sum to **5,547,330 micro-USD**, exactly equal to both `spent` and `(total input × 3 + total output × 15)` under the ledger's historical prices. All 132 rows have status 200; there are no separate failed-attempt rows to settle the 183,285 micro-USD difference. This corroborates the successful-row arithmetic without resolving physical-attempt identity, hidden usage components, prices actually charged, or unknown outcomes.

The distinct cumulative snapshots also retain exactly the same **183,285 micro-USD** commitment difference throughout:

| Snapshot | Spent, micro-USD | Committed, micro-USD |
| --- | ---: | ---: |
| `note-proof.json` | 4,960,299 | 5,143,584 |
| `reminder-create-proof.json` | 4,990,614 | 5,173,899 |
| `reminder-edit-proof.json` | 5,112,300 | 5,295,585 |
| `local-web-message-proof.json` | 5,357,775 | 5,541,060 |
| Final `web-message-69dfee07-3da4-4a43-89fe-2ea4342ef792.json` | 5,547,330 | 5,730,615 |

These are repeated observations of the carried difference, not five additional debts. The two duplicate proof pairs identified above are also byte-identical, rather than merely equal in their budget fields.

The bounded local inventory examined 31 parseable QA JSON files after excluding credential/session/token/sign-in named files and logs; only the two accounting sources and seven cumulative proof artifacts exposed cost/usage/budget metadata in the inspected structure. Named live scripts and QA accounting reports were searched as well. No additional cost-bearing manifest surfaced in that scope. This is a local artifact search, not a claim that excluded, removed, overwritten, external, or differently structured records contain no calls.

Two concrete source-level gaps prevent establishing the record universe:

- `scripts/daily-beta-live.ts` and `scripts/local-web-message-live.ts` choose the ledger folder from `TEMPO_QA_RUN_DIR` (default `qa/daily-beta-live`); a complete set of historical run directories is not recorded in these manifests. Their proof/transcript paths can also be overwritten. Finding the known release ledger does not prove all executions used it.
- The inspected `qa/adaptive-home/live-task-presentation.ts` does not use `withLiveQaBudget`. It overwrites the single success JSON path, and its failure branch prints sanitized status/type/usage without saving a durable failed-attempt artifact. The one success artifact therefore cannot prove the number or cost of any earlier attempts. This is a completeness limitation, not evidence that additional paid attempts actually occurred.

The strongest supported subtraction is the **conditional bookkeeping residual of US$4.262227**: `10 − (5.730615 + 0.007158)`. It assumes the visible estimates and carried commitment are the complete applicable accounting base, which the evidence does not establish. It is **not an upper bound on actual charges, a verified remaining balance, or a spendable allowance**. No positive safe remaining-cap allowance can be certified from these local artifacts; preserve the unknown commitment and keep paid canaries blocked pending the reconciliation proof listed above. No provider invoice or console was checked.
