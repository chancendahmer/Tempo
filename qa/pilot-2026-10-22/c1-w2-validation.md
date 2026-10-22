# C1 / W2 validated checkpoint — October 22, 2026

Environment: adaptive worktree on `codex/tempo-adaptive-home`, based on `1b1b9cf`. This is local candidate evidence; no production release, paid API call or customer outreach occurred. The exact code checkpoint is recorded in `docs/PILOT_HANDOFF.md` after committing these results.

## Final checks

| Check | Observed result | Scope |
| --- | --- | --- |
| `npm run check` | Exit0; lint/typecheck pass; **1,058 tests passed,3 skipped;143 files passed,2 skipped**; Next production and operations builds pass | Final combined C1/W2 source, local tests/build |
| `npm run simulate:assistant -- --scripted` |33 turns,zero detected issues | Scripted model/captured adapters; not live model quality |
| Two-client real PostgreSQL budget race |100global contenders→10accepted atcap;100claim contenders→1winner;100settlements→1settlement/99replays;200account contenders→100accepted,one/account | Synthetic prices/usage,110settled attempts,zero outstanding debt; ownedDBremoved |
| Migration0032→0033 and rerun | Existing account/task/feedback rows unchanged;34migrationrecords stable onrerun;catalog constraints/indexes matchsnapshot | Isolated realPG and production migrationrunner/advisorylock; not hosted backuprestoration |
| Independent C1 reviewer |45final pricing/ledger/report tests;35boundary/control tests;officialsources reviewed;no confirmed accounting/security defect | See review's precise authorship and earlier superseded checkpoints; no numeric wholeproduct rating |
| Enforced zero budget/accounting outage |STOP,HELP,pause,authenticated cancellation and existingreminder handler remain independent;no accountingaccess in these paths | Synthetic fixtures, not SMSdelivery |
| W2 targeted checks |49tests plus27updated itemreview/view tests passed | Savedcadence/timezone/history;tasktime and completion independence;scripted Nov2–8 fixture |
| Fresh authenticated W2HTTP/PG review |Six groups passed,including feedback retry same receipt and separate reminder persistence | No actual browser/rendered UI orprovider |

The first integrated run failed two old item-review assertions expecting cancelled reminders to disappear. Those assertions were updated to verify retained cancelled owner history, cancelledAt, no delivery context and unchanged delivered-message history. The final full rerun above passed. Simulated billing/configuration error logs in the suite are intentional mocks, not actual provider failures. Local raw log: ignored `c1-integrated-check.log`.

## Implemented behavior

- All five AI request families use a per-physical-call reserve/claim/settle boundary with trusted account/execution scope. Conservative pinned pricing, call/money caps, explicit SDK retry control, uncertain-debt retention, component/monetary overage halt and sanitized operator reporting are implemented. Enforcement remains off unless explicitly enabled with approved configuration.
- Paid accounting cannot join a domain rollback transaction. Duplicate claims and settlements do not grant duplicate permission or refund debt. Old unresolved attempts survive UTC rollover and account erasure.
- Reminders display saved cadence andtimezone, active/past status and cancelled/completed history. Task time and completion do not silently request/cancel a text. Preview cancellation and spoken upcoming briefings follow the same status meanings.

## Current limits and next action

Browser tooling returned no available surfaces and IAB creation failed. No new screenshots, physical-phone keyboard, screen-reader or clipboard-denial evidence exists. The six HTTP groups do not replace those checks. The three complete fresh novice-week scenarios remain to be executed; the W2 Nov2–8 test is a bounded reminder scenario only.

C1 still needs an approved operatingbudget/retention policy, deployment-wide configuration verification and an authorized live billing canary. Current attestations cannot prove AI budget enforcement; the report deliberately returns unverified enforcement and unknown headroom. Price verification expires November22. See `docs/PILOT_AI_ACCOUNTING.md` for sources, reservation sizes, recovery and rollback rules. The existing deferred-search `pause_turn` continuation limitation is tracked for provider validation.

The historical $10 testbudget remains unreconciled; `live-budget-reconciliation.md` gives exact known record subtotals and missingproof. This continuation spent **$0**. Do not infer an available balance from the visible estimates.

ProductionSMS/Google/model/search/catalog checks, hostedbackuprestore, operationalalerts and rollout/rollback remain releasegates. No first10/25/100ready claim or new wholeproduct8/10 rating is established. Next: resume Q1 in an available authenticated browser, complete the fresh journeys, then finish C1rollout/L1 evidence before preparing release approval. Do not restart the approved Home design or merge old PR26.
