# Executable continuation brief: Tempo private pilot

Updated October 22, 2026. This is a live engineering checkpoint, not release approval.

Current tested continuation: the commit containing this brief, based on **`3892b74`**,
on `codex/tempo-adaptive-home`. It follows `188d0f8` (C1/W2), `fed7d5b`
(A2/R2) and `4400de5` (A1/W1/R1). No production merge/deploy occurred. Verify the current
remote tip before continuing; the old PR26 is a different branch.

## Prompt for the next lead (Astra medium or Sol)

You are Tempo's principal engineer and release owner. Continue the approved
adaptive UI and shared-account product toward a controlled **10 → 25 → 100-person
private pilot**, following `docs/PILOT_PLAN.md`. Execute bounded implementation,
tests and independent review; do not restart the visual design or merely propose
another plan. Keep the shared workspace as the authoritative source for Tempo's
own assistant and future authorized external agents. Hardware, new wearable
integrations and unrestricted agents are deferred.

Work in:
`C:\Users\chanc\.codex\worktrees\tempo-adaptive-home\Agentic AI Assistant SMS`
on `codex/tempo-adaptive-home`. Verify git state first. Preserve unrelated edits
in the original OneDrive checkout; do not merge/copy that checkout wholesale.
Read `AGENTS.md`, `docs/AI_CONTEXT.md`, this brief and the relevant current result
file; consult local `node_modules/next/dist/docs/` before changing Next code.
Search narrowly. Never read populated secret files or print environment secrets.

Use up to three Sol 6.1 agents with bounded file ownership: cost controls,
workflow acceptance, and operational release checks. Rotate one to independent review; authors cannot be their own
sole reviewers. You own shared files, migration compatibility, integration and
release. Agent scores require actual evidence and cannot override a broken gate.
Check usage at milestones; save a checkpoint before remaining usage falls below
15%. The tool's account/window meter may differ from the founder's display.

Start by checking current source and QA results, not by rerunning completed
research. Resolve the highest-risk unfinished package, validate, then checkpoint.
Continue independent work when a live provider/access dependency is blocked.

## Current work and evidence

### Latest integrated continuation — supersedes pending claims in older checkpoints

- **Full `npm run check` passed:** lint, typecheck, 1,183 passing / 3 skipped
  tests (158 passing / 2 skipped files), Next production and operations builds.
  The isolated build directory was `.next-pilot-final`; generated path churn was
  restored afterward. See `qa/pilot-2026-10-22/integrated-continuation.md`.
- Delivered one-time reminders can create one linked follow-up without rewriting
  sent history. Real two-client PostgreSQL races exposed two lock-order defects;
  both were fixed and independently rechecked, including account deletion.
- Three scripted novice weeks now run across 21 durable daily checkpoints.
  They use fake providers, not a live model or actual week of customer use.
- Workspace, setup, feedback and profile writes bind the initiating UI to its
  authenticated account. Auth loss clears private drafts; same-account transient
  failures preserve them. Profile/Board/Extensions gained recoverable loading.
- A real browser found an unbound native-fetch feedback failure. Repaired code
  passed local database outage → retained draft → retry → one saved receipt,
  copy and keyboard focus checks. Unexpected errors on seven authenticated
  routes no longer log raw database errors/parameters.
- Root interacted with authenticated food, groceries/pantry, nutrition, routine,
  goal, memory deletion and fitness flows. Ten independent database assertion
  groups confirmed the resulting records. See `fresh-browser/README.md` and
  `records.json`. Independent visual review of captures 01–09 scored **8.3/10**;
  it is not independent browser interaction or whole-product certification.
- C1 web/worker heartbeats now attest observed policy/model configuration. They
  still cannot establish complete deployment inventory, approved caps or verified
  enforcement; reported headroom stays unknown. Search continuation is fixed and
  unit-tested, with live provider validation still outstanding.
- A guarded local dump/restore rehearsal passed all 55 tables, 34 migrations,
  encryption/debt/constraints/sequence checks and database cleanup. Independently
  rerun with conflicting synthetic environment settings. Hosted backup, key
  custody, point-in-time recovery and worker restart remain separate evidence.
- Paid API spending this continuation: **$0**. Source-pinned historical review
  confirms estimates of $5.554488 usage / $5.737773 commitments, but missing and
  overwriteable artifacts prevent proving aggregate allowance. Do not spend the
  conditional $4.262227 remainder without reconciliation.

Next independent work: real HTTP/PG cross-account stale-owner cases; remaining
mutation-route audit; browser recovery and onboarding gaps. Root owns checkpoint
commits. No candidate PR exists as of this checkpoint; PR26 is still unrelated.

### Latest C1/W2 checkpoint — supersedes the older pending work below

- C1 implementation and local validation are complete: all five AI adapters use
  durable per-call reservations, trusted account scope, monetary/call caps,
  versioned pinned pricing, zero SDK retries, uncertain-debt retention across
  rollover and account erasure, atomic overage halts and sanitized reporting.
  Migration 0033 and its snapshot are additive. Enforcement remains off.
- C1 rollout is not approved. Read `docs/PILOT_AI_ACCOUNTING.md` for operating
  caps, retention/disclosure, deployment-wide enforcement and live billing gates.
  The pricing snapshot expires November 22. Current attestations cannot prove AI
  budget configuration; the report correctly says unverified with null headroom.
- W2 saved cadence/timezone, cancelled/completed history and task/reminder copy
  are implemented. Task completion preserves a separately requested reminder.
  The bounded scripted November 2–8 fixture is not all three complete novice weeks.
- Final `npm run check`: lint/typecheck, **1,058 passing / 3 skipped tests**,
  143 passing / 2 skipped files, Next production and operations builds pass.
  Scripted assistant simulation: 33 turns, zero detected issues, not live AI.
- Two-client real PostgreSQL race: 100 global attempts admit exactly ten at the cap;
  duplicate claim/settlement has one winner; 200 account attempts admit one per
  100 accounts. All 110 admitted attempts settled, zero outstanding debt. This is
  synthetic accounting, not provider invoice or production-capacity evidence.
- RealPG migration 0032→0033 and rerun preserved existing account/task/feedback
  rows, 34 stable migration records and matching constraints/indexes. No hosted
  migration or production deployment occurred.
- Independent C1 review found no confirmed accounting/security defect in the
  reviewed final code and focused suites. Deferred search `pause_turn` behavior
  still needs provider validation; see the review's precise limitation.
- Q1 browser tooling returned no browsers and IAB creation failed. Six fresh
  authenticated local HTTP/PG groups passed; they do not replace rendered UI,
  physical-phone, keyboard, clipboard-denial or screen-reader evidence. No new
  visual score was assigned.
- This continuation spent **$0**. Historical visible estimates are $5.554488
  spent and $5.737773 carried commitments, including $0.183285 unresolved.
  These incomplete subtotals do not establish remaining aggregate $10 allowance.

Authoritative current results: `qa/pilot-2026-10-22/c1-w2-validation.md`,
`c1-independent-review.md`, `c1-budget-race.json`, `c1-migration-review.md`,
`w2-reminder-clarity.md`, `w2-browser-review.md`, and
`live-budget-reconciliation.md`. Read final addenda over earlier pending items.

### Prior A1/W1/R1 and A2/R2 checkpoints

Initial sprint HEAD was `d7e1a0e` over code checkpoint `864fecb`. Previous Home
customer/design ratings were 8/10 and 8.4/10; these are not whole-product release
ratings. Prior evidence: `qa/adaptive-followthrough/README.md`.

October 22 packages:

- **A1 implemented:** private admission at web and SMS entry points; malformed
  configuration fails closed for new enrollment; legacy verified access retained.
  STOP from a non-invited number is stored as durable suppression without
  activation/onboarding. Invitation/web consent cannot clear STOP. Explicit START
  is required. Public Calendar disclosure now reflects actual read/write scope.
- **W1 implemented:** shared `create_task.sourceNoteId` transaction preserves the
  source thought, creates one task and stores a server-owned backlink. Retry,
  completion, removal and history truncation are handled. Newly assigned workout
  plan links must be owned, existing plans; deleting an old own plan does not
  erase or prevent unrelated edits to workout history. Category copy and quantity
  plurals improved. No new migration in A1/W1.
- **R1 implemented:** explicit 15s/zero-SDK-retry intervention model bounds;
  isolated real-PG/pg-boss 20/100-account harness with fixed ceilings and captured
  transport. Last successful 100-account observation: 200 turns, 100 duplicate
  suppressions, 100 captured acceptances, 10 deliberate rejection/retry recoveries,
  zero unfinished/uncertain/blocked work. Workload drain 28.029s, p95 completion
  26.526s. A fresh replacement-cluster run subsequently passed in 28.302s with
  p95 26.919s and the same counts/zero stranded states. An independent 20-account
  run also passed. This is synthetic local correctness, not production capacity.
- **Independent A1/R1 review:** found a P1 STOP → pause → web-reconsent bypass.
  Author repaired it; reviewer independently verified STOP remains authoritative.
  The harness ambient-env dependency was repaired and independently exercised.
- **A2 implemented:** explicit durable account timezone confirmation, dedicated
  encrypted/idempotent/rate-limited feedback records, private receipts, optional
  follow-up consent and metadata-first operator retrieval. Migration 0032 is
  additive; its constraint name was independently corrected before checkpoint.
- **R2 implemented:** per-instance worker build/policy attestation, separate web
  health scope and a read-only aggregate operations report. Independent review
  found and closed stale-worker false-safe reporting and a heartbeat shutdown
  race. Unknown/stale history cannot prove sending is disabled. Deployment docs
  now correctly describe both migration runners and their shared advisory lock.
- **Final integrated check:** lint, typecheck, **1,004 passing tests / 3 skipped**
  across 137 passing / 2 skipped files, Next production build and operations
  build passed. Scripted assistant simulation: 33 turns, zero detected issues.
  This is not observed live model output.
- **Authenticated local checks:** ten HTTP acceptance groups passed; browser
  timezone confirmation survived reload, feedback receipt/copy/focus worked at
  phone width, and thought → six-minute task → completion preserved the original
  thought after reload. Customer review 9/10; designer review 7.5/10 with no open
  observed visual defect but requested interaction/accessibility coverage still
  outstanding. Do not promote these to whole-product or live-provider ratings.

Current result files under `qa/pilot-2026-10-22/` are the authority for updated
counts and limitations: README, browser-journey, activation-feedback,
independent-wave2-review, migration-release-review, reliability-r2 and the load JSON.
Do not confuse audit pre-fix
findings with unresolved defects; read their implementation addenda.

## Next work packages

1. **C1 rollout decisions and verification.** Do not rebuild the implemented
   ledger. Follow `docs/PILOT_AI_ACCOUNTING.md`: approve operating caps and
   retention, reconcile the old live-test ledger, verify every AI-producing
   process uses the intended enforced policy and complete an authorized billing
   canary. Never enable with guessed caps or substitute the test budget for a
   pilot operating budget. Keep STOP independent.
2. **W2 remaining live-language acceptance.** The three scripted novice weeks and
   delivered-reminder follow-up are complete. Read first-week-acceptance.md before
   adding tests. Remaining live-model/combined-language and real delivery checks
   must preserve explicit intent and distinguish fixture adapters from providers.
3. **Q1 fresh customer + designer reviews.** Use current authenticated local build,
   new and populated synthetic accounts, phone/desktop/keyboard and relevant
   workflows. Observe UI + records, record screenshot authorship and limits.
   Complete physical-phone, clipboard-denied fallback and screen-reader evidence.
   Root checks cover successful save/copy, real failed-save/retry, Tab wrapping,
   Escape focus restoration, food, routines, goals, fitness and memory deletion.
   Continue account-switch and remaining settings/onboarding recovery. Keep approved
   Home structure; no open-ended redesign. Fix findings, recheck affected journeys.
4. **L1 live integration and deployment.** Reconcile live-test budget and access,
   actual candidate SMS + Google + model/search + food/barcode provider paths,
   migrations, backup restore, alert delivery and rollback. Only then prepare a
   release branch/PR and complete release gates. No automatic production merge.

Both web and worker run the shared locked migration runner; the prior docs
contradiction is fixed. Local additive upgrade/rerun passed, but hosted migration
ordering, backup restoration and actual deployment compatibility remain gates.

## Safe local validation

Normal commands in the adaptive worktree:

```text
npm run check
npm run simulate:assistant -- --scripted
npx tsx scripts/pilot-load.ts --accounts 20
npx tsx scripts/pilot-load.ts --accounts 100
npx tsx scripts/pilot-budget-race.ts
node qa/adaptive-home/start.cjs
```

The launcher uses only explicit synthetic localhost configuration and refuses
populated env-file loading. Preview is `http://localhost:3103/workspace/preview`;
authenticated local workspace is `/workspace`. Preview is fictional, resets on
reload and proves neither account persistence nor provider delivery.

Current isolated local PG target:
`postgresql://postgres@127.0.0.1:55437/tempo_ui_release`.
The old temp-directory cluster had missing template files. It was gracefully
stopped and left untouched at
`C:\Users\chanc\AppData\Local\Temp\tempo-ui-release-pg17\data`.
A fresh official PostgreSQL 17.11 runtime and synthetic cluster now live under
`C:\Users\chanc\.codex\runtimes\tempo-pg17-20261022` (binary directory
`pgsql\bin`, data directory `data`, log `server.log`). It binds loopback only.
Migrations through 0032 were applied, and fresh 20/100 harnesses passed. This is
replacement fixture infrastructure, not restoration or repair of the old cluster.
The preview DB received 0032 before its unshipped constraint-name correction;
fresh integration/upgrade fixtures verified the corrected final SQL. Do not
delete the preview DB or rewrite a shipped migration to hide that difference.

Use the development launcher for authenticated HTTP-local QA. Its optional
`--production` mode starts the optimized server but authenticated APIs correctly
reject its HTTP localhost APP_BASE_URL under production security validation.
Do not weaken HTTPS validation to make that local mode pass. Production build
success is distinct from a hosted authenticated runtime test.

Prior HTTP checks, once the isolated runtime is healthy:

```text
npx tsx qa/customer-review-2026-10-15/authenticated-http.ts http://localhost:3103 --history-boundary
npx tsx qa/adaptive-followthrough/authenticated-home.ts http://localhost:3103
```

They create synthetic accounts through local services; don't point them at
production. Do not publish short-lived local sign-in links or cookies.

## Access, spending and release boundaries

- Historical user authorization: implementation, isolated tests, dedicated demo
  SMS only, clearly fictional demo Calendar records, candidate publishing and
  gated release. Preserve personal records and never test outreach to customers.
- Dedicated demo number ends **8736**; demo Google identity is
  **chancendahmer@axionsystems.us**. Last historical login confirmation is not proof
  of current session validity. User cannot supply new logins while away.
- **Paid API test cap is US$10 aggregate**, not per agent, retry or provider.
  October 22 work so far uses no paid calls. Before any live call, reconcile the
  older `qa/release-2026-10-15-live/cost.json` ledger (spent 5.54733, committed
  5.730615 at inspection) and later task presentation call (0.007158). These known
  entries are not a complete statement of remaining budget. Keep central
  conservative reservations; never let each agent spend independently.
- No paid staging/services, subscription changes or spending increases authorized.
  The $10 test cap does not establish a monthly pilot operating budget.
- PR26 (`https://github.com/chancendahmer/Tempo/pull/26`) targets main from
  **codex/tempo-calm-ui**, not this adaptive branch. Verify branches/ancestry and
  latest remote before publication; don't accidentally merge the older UI.
- Production: `https://tempo-production-8e25.up.railway.app`. No October 22 production
  write, migration, release or customer outreach has occurred at this checkpoint.
- Adaptive Home migration0031 and new feedback0032 were not applied to production
  by this run. Local additive upgrade/rerun and rollback compatibility were
  reviewed. Keep additive schema and ledger when rolling code back; never drop
  customer data merely to undo an application deployment.

Final handoff must name the actual commit/branch, completed packages and check
results, observed reviews, remaining blockers, API spend and next exact action.
Never label all 100 seats ready from preview scores or synthetic throughput.

C1 migration 0033 likewise remains undeployed. Preserve its ledger during rollback;
never roll back to unmetered code while AI-producing processes continue to run.
