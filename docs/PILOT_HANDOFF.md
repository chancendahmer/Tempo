# Executable continuation brief: Tempo private pilot

Updated October 22, 2026. This is a live engineering checkpoint, not release approval.

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

Use up to three Sol 6.1 agents with bounded file ownership: activation, workflows,
and reliability. Rotate one to independent review; authors cannot be their own
sole reviewers. You own shared files, migration compatibility, integration and
release. Agent scores require actual evidence and cannot override a broken gate.
Check usage at milestones; save a checkpoint before remaining usage falls below
15%. The tool's account/window meter may differ from the founder's display.

Start by checking current source and QA results, not by rerunning completed
research. Resolve the highest-risk unfinished package, validate, then checkpoint.
Continue independent work when a live provider/access dependency is blocked.

## Current work and evidence

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
  26.526s. This is synthetic local correctness evidence, not production capacity.
- **Independent A1/R1 review:** found a P1 STOP → pause → web-reconsent bypass.
  Author repaired it; reviewer independently verified STOP remains authoritative.
  A small harness ambient-env dependency was also identified for repair.
- **Integrated initial check:** lint, typecheck, 929 passing tests / 3 skipped,
  Next production build and operations build passed. STOP/pause follow-up has
  separate targeted and independent passes; rerun final check on the final source.

Current result files under `qa/pilot-2026-10-22/` are the authority for updated
counts and limitations: admission-contract, workflows-audit, reliability-results,
independent-platform-review and the load JSON. Do not confuse audit pre-fix
findings with unresolved defects; read their implementation addenda.

## Next work packages

1. **A2 activation/feedback.** Implement validated explicit timezone confirmation
   through existing setup/shared users.timezone. Browser zone is only a suggestion;
   don't silently shift reminder instants or enable consent. Add a short feedback
   dialog, account-owned encrypted optional detail in a dedicated feedback table,
   idempotent and rate-limited authenticated POST, deletion cascade and masked
   operator retrieval. No transcript or personal data automatically attached.
2. **R2 operator visibility.** Attest worker build and effective sending policy
   in heartbeat; account for overlapping replicas, malformed/stale attestations,
   canary overrides and independent cleanup switch. Public output is a selected
   boolean/count/build projection, never arbitrary metadata. Add a read-only
   pilot operations CLI and correct the emergency runbook: web health does not
   prove worker configuration. No new infrastructure.
3. **C1 spend/rate safety.** Design and implement aggregate model usage/budget
   protection across all call paths with atomic reservation/reconciliation, or
   document a verified interim provider cap + very small cohort. Existing QA
   ledger and per-request token limits do not bound production aggregate spend.
   Always permit STOP, cancellation and privacy controls. Avoid adding speculative
   infrastructure; measure actual calls before choosing limits.
4. **Q1 fresh customer + designer reviews.** Use current authenticated local build,
   new and populated synthetic accounts, phone/desktop/keyboard and relevant
   workflows. Observe UI + records, record screenshot authorship and limits.
   Confirm thought conversion links, setup, feedback, timer, food flow and return
   next day. Keep approved Home structure. Fix findings, recheck affected journeys.
5. **L1 live integration and deployment.** Reconcile live-test budget and access,
   actual candidate SMS + Google + model/search + food/barcode provider paths,
   migrations, backup restore, alert delivery and rollback. Only then prepare a
   release branch/PR and complete release gates. No automatic production merge.

The R2 audit also found `railway.worker.toml` runs migrations while deployment
documentation says only web does. Reconcile the intended deployment ordering and
migration locking before release; don't blindly remove a predeploy command.

## Safe local validation

Normal commands in the adaptive worktree:

```text
npm run check
npm run simulate:assistant -- --scripted
npx tsx scripts/pilot-load.ts --accounts 20
npx tsx scripts/pilot-load.ts --accounts 100
node qa/adaptive-home/start.cjs
```

The launcher uses only explicit synthetic localhost configuration and refuses
populated env-file loading. Preview is `http://localhost:3103/workspace/preview`;
authenticated local workspace is `/workspace`. Preview is fictional, resets on
reload and proves neither account persistence nor provider delivery.

Historical local PG target:
`postgresql://postgres@127.0.0.1:55437/tempo_ui_release`.
**New local infrastructure blocker found October 22:** after successful harness
runs, an independent CREATE DATABASE failed because template1 was missing
`base/1/4171`; a template0 probe also found a missing file. Do not reset that shared
cluster or present later runs as passing. Preserve its existing fixture data.
Check the newest reliability result for any subsequent isolated recovery/new
cluster. The successful earlier run remains attributed historical evidence.

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
- Production: `https://tempo-production-8e25.up.railway.app`. No October22 production
  write, migration, release or customer outreach has occurred at this checkpoint.
- Adaptive Home migration0031 already exists but was not applied to production
  by the UI pass. Any new feedback migration needs compatibility and rollback
  review. Don't drop old data to roll code back.

Final handoff must name the actual commit/branch, completed packages and check
results, observed reviews, remaining blockers, API spend and next exact action.
Never label all 100 seats ready from preview scores or synthetic throughput.
