# Private-pilot hardening checkpoint — October 22, 2026

Candidate branch: `codex/tempo-adaptive-home`. First sprint checkpoint:
`4400de5`; integrated A2/R2 and final review corrections: **`fed7d5b`**.
This is **not a production release or permission to invite
100 people**. No provider calls, paid API usage, hosted migrations, customer
outreach or production changes occurred in this sprint.

## Decisions and implementation

Keep the approved adaptive Home and finish the shared daily-use loop. Roll out
to ten invited users first, then 25, then 100 only after the operating gates in
[PILOT_PLAN](../../docs/PILOT_PLAN.md) pass. The executable continuation prompt is
[PILOT_HANDOFF](../../docs/PILOT_HANDOFF.md); the next cost-control engineer's
bounded assignment is [PILOT_COST_CONTROL_BRIEF](../../docs/PILOT_COST_CONTROL_BRIEF.md).

Sol 6.1 implementation agents owned activation, connected workflows and
reliability; separate reviewers checked other authors' code, migrations and UI
evidence. Root owned integration, source boundaries, browser checks and decisions.

- A1: invitation-aware enrollment, legacy access and retained STOP suppression.
- W1: atomic thought/task identity, original-note preservation on completion,
  replay prevention, owned workout-plan links and historical-record compatibility.
- R1: explicit intervention model deadlines and isolated 20/100-account queue drill.
- A2: account timezone confirmation, encrypted private feedback and receipt,
  optional follow-up, retry/rate controls and metadata-first operator retrieval.
- R2: worker build/effective-policy attestation, selected public health scope,
  read-only operator reporting and corrected incident/deployment guidance.

Independent review caught and verified corrections for a STOP/pause/reconsent
bypass, stale-worker false-safe reporting, an in-flight heartbeat retirement
race, an unshipped migration FK-name mismatch and bounded UI issues. No open
critical/high finding remains in these reviewed packages; that does not establish
the absence of defects throughout the product.

## Validation actually run

| Evidence | Result | Limit |
| --- | --- | --- |
| Final `npm run check` | PASS: lint, typecheck, 1,004 tests, Next production build, ops build; 3 tests skipped / 2 files skipped | Local configured test suite, not deployment |
| Scripted assistant simulation | 33 turns; zero detected issues | Scripted model/captured adapters, not live AI quality |
| Authenticated HTTP Home fixture | Ten acceptance groups passed | Isolated accounts and PG; no carrier/provider proof |
| Fresh 100-account PG/pg-boss drill | 200 turns, 100 duplicates suppressed, 100 captured accepts, 10 rejection/retry recoveries; 28.302s drain, p95 26.919s, zero stranded/uncertain/blocked state | Scripted parsing/captured SMS, not hosted capacity |
| Independent fresh 20-account drill | 40 turns, 20 duplicate suppressions, 20 accepts, 2 retries; 5.809s drain, zero bad final state | Same local correctness boundary |
| Independent A2/R2 review | 71 initial tests; 39 final R2 tests; four independent STOP/stale-worker probes passed | No live worker fleet or provider |
| Migration review | 16 tests; isolated upgrade/rerun through0032 preserved existing data, matching FK, stable33-entry ledger | PGlite, not hosted backup/restore |
| Browser flow | Timezone reload; feedback save/copy/focus; thought→task→timer→completion→reload preserved original | Desktop + phone-sized viewport, not physical phone |

Raw normal-command logs are local ignored files `integrated-check.log` and
`scripted-assistant.log`. Portable result files are included here. Simulated
provider error logs in the full suite are deliberate mocks, not observed billing
or authentication failures from the real account.

## Reviews and launch gaps

[Customer review](customer-final-review.md): **9/10** for the bounded additions.
[Designer review](designer-final-review.md): **7.5/10**, with observed visual
findings closed but physical-phone keyboard, save failure/retry, denied clipboard
and screen-reader checks still requested. Do not average these scores into a pass.
[Browser observations and screenshots](browser-journey.md) identify authorship
and scope. Historical Home scores of8/10 and8.4/10 are not new whole-product scores.

Still needed: aggregate model/search spend protection and a pilot operating
budget; recurring-reminder/linked-task expectation clarity; fresh whole-customer
journeys; real candidate SMS/Google/model/provider verification within a reconciled
test budget; hosted backup/restore, alert delivery, rollout/rollback and deliberate
invite-only configuration on both web and worker. Optional hardware/background
alarms/wearables remain unverified and must not be presented as available.

## Local infrastructure note

The old temp-directory PostgreSQL fixture had missing template files and was
stopped without changing its data. A fresh official17.11 runtime/cluster at
`C:\Users\chanc\.codex\runtimes\tempo-pg17-20261022` now serves the explicit
loopback55437 fixture. Fresh load runs use disposable owned databases and removed
them afterward. This is not a backup restoration claim.

Authenticated browser checks use `node qa/adaptive-home/start.cjs`. Trying its
`--production` option correctly rejected HTTP localhost APP_BASE_URL for account
APIs. HTTPS validation was preserved; the final local browser was returned to
development mode. Optimized build success and hosted runtime success remain
separate evidence.
