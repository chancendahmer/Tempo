# Hosted release audit

This checklist covers the production baseline at `86ae010` and the candidate through additive migration `0035`. The console probe reads the running process and PostgreSQL metadata. Railway inventory, backup, alerting, provider billing and deployment history require separate evidence from the corresponding operator views.

## Observed production worker baseline

The operator's read-only Railway worker probe matched the effective runtime and Railway Git stamps to `86ae01023abcf24bcc8da9ed9d367192e14a29ae`. PostgreSQL returned 29 ledger entries and verified the complete ordered prefix through `0028`. The snapshot contained one fresh legacy worker heartbeat.

The observed worker used default open admission with zero configured invitees, shadow mode on, autonomous sending off, cleanup check-ins on, and one proactive canary entry. AI budgeting was off. Provider key-pair and webhook secret presence checks passed. This establishes only the worker baseline. Web settings, complete replica inventory, enforcement, and hosted recovery still require separate evidence.

## Before rollout

November 10 updates: the founder approved the exact historical disposition below.
It has not yet been applied. An encrypted production snapshot was successfully
restored to an isolated PostgreSQL 18.6 clone; original aggregates and the exact
0028 ledger matched. The pinned candidate migrated the clone through 0035 and a
second migration run was unchanged. The clone was stopped and transient plaintext
retired. This establishes one recovery point; scheduled backups/PITR are still
unavailable on the observed plan. See `logical-backup-restore.md`.

The running worker's allowlisted model probe returned `claude-sonnet-4-6`. The
candidate uses this model for the primary parser and Haiku 4.5 for separately
metered hosted search. The same v2 pricing policy must be effective on both web
and worker. The exact approved historical disposition remains pending in the
observed hosted state.

- Verify the intended Railway service roles, source/config paths, replica inventory, public HTTPS, common PostgreSQL service and existing encryption key. Verify the carrier webhook and Google callback at the canonical origin. Record public build stamps and deployment times. Verify sensitive values privately.
- Verify the complete ordered migration prefix and SQL digests before rollout. Baseline `86ae010` ships through `0028`. The normal pinned candidate pre-deploy runs through `0035`. The shared migration lock serializes the two services. Inspect accounting, receipt inbox and disposition schema at the resulting prefix.
- Apply the same settings to web and worker for bounded demo verification. Start with an empty invite list so new enrollment stays closed. Existing accounts with a verified phone and an onboarding state beyond awaiting consent remain admitted. Use only the dedicated demo account for the live check.

```dotenv
PILOT_ADMISSION_MODE=invite_only
PILOT_INVITED_PHONES=
INTERVENTION_SHADOW_MODE=true
AUTONOMOUS_SENDING_ENABLED=false
CLEANUP_CHECKINS_ENABLED=false
PROACTIVE_CANARY_USER_IDS=
ANTHROPIC_MODEL=claude-sonnet-4-6
AI_BUDGET_MODE=enforce
AI_BUDGET_PRICE_VERSION=anthropic-standard-2026-11-10-v2
AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS=9000000
AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS=9000000
AI_BUDGET_GLOBAL_DAILY_CALLS=100
AI_BUDGET_ACCOUNT_DAILY_CALLS=60
```

Use the direct `https://api.anthropic.com` SDK route. The price snapshot expires
November 22 at 00:00 UTC. Reserve the one-time **$9 hosted hold** in the
existing amended QA journal before enabling this hosted allowance. The lead uses
`node --import tsx qa/pilot-2026-11-10/live-budget-hosted-hold.ts --reserve-9-usd`
after the local paid checks. It appends the hold under the journal lock and
requires no network request. The live Sonnet metering proof left $7.422493
committed before the hosted hold. At that point $9 would leave $3.577507 in the
$20 authorization for other independent QA commitment. Read the actual balance
at the hold, since later tests can change it. The $1 carrier hold is already in
the balance. Count each request once and track hosted attempts within the held
$9. The limits apply per UTC day, and outstanding debt remains reserved. Pause
the hosted test allowance at the end of verification or before midnight UTC,
whichever comes first, unless the approved ongoing policy takes effect.

The production ledger shares one global reservation lock across candidate
instances. A normal Sonnet request reserves up to $6.021 at 1,400 output tokens,
and each isolated Haiku hosted-search request reserves $4.08. Complete one demo
scenario at a time so settlement can free reservation headroom.

After migration, re-preview the exact 35-row batch and require the approved
SHA-256 `aaddd2dd3a463820aec0af2dc25f0ac8b08b05dc75e787620fb2900e5fa98565`.
Use approval reference `nov10-history-review`, require the default dry run to
verify the same private manifest, and apply the approved
`close_unresolved_without_replay` decision. Audit that manifest again and verify
that readiness continues to count any new ambiguity or reactivated linked work.
[Historical review](outbound-history-review.md)

## Rollout verification

- Freeze the candidate after the integrated checks. Deploy it to the existing Railway web and worker services using their normal pre-deploy migrations. Require the exact 36-entry ledger through `0035`, matching pinned build and effective configuration, fresh web and worker attestations, and retired old replicas. The old `86ae010` build lacks both invite admission and AI metering. Retire its AI-producing processes before starting the paid demo.
- Verify `/api/health` and `/api/ready`. Recheck operations evidence for new outbound uncertainty, receipt overflow, failed or stalled jobs, accounting errors and intended alert delivery. Confirm carrier and billing evidence from the operator views. Recheck the same build and readiness after publishing the approved main revision.
- From the authorized demo account, send one uniquely named task request with a reminder at an explicit near-future local time in the permitted window. Require one owned task and scheduled reminder in the workspace after reload, then observe actual phone delivery and its carrier status. Verify the task and reminder remain separate.
- Request one uniquely named Google Calendar event at an explicit date, time and time zone. Verify the proposal precedes the write, confirm through the normal flow, and see the exact event in Google Calendar and the workspace after reload. Remove that disposable event through the normal confirmed flow and verify its absence.

## Rollback

- To pause candidate paid calls, retain `AI_BUDGET_MODE=enforce` and the v2 price version, and set both daily money caps and both daily call caps to `0` across all AI-producing roles. Verify the paused configuration took effect. Keep invite-only admission, shadow mode on, autonomous and cleanup sending off, and the proactive canary list empty.
- If reverting to `86ae010` or another build without enforcement, stop paid ingress and workers before reverting. Those builds lack the candidate pause controls. Preserve the compatible web and worker pair, additive schema, receipt inbox, historical dispositions and accounting records. Verify code stamps and queue state, and reconcile uncertain outcomes without replay.
- Use the verified encrypted recovery point when data recovery is required. The restored snapshot and clone rehearsal establish one recovery point. The observed Railway plan lacks scheduled backups and PITR. [Recovery drill](logical-backup-restore.md)

The probe source is `release-preflight.ts`. It reports allowlisted release metadata and fixed aggregates from a bounded read-only PostgreSQL snapshot. Its `ok` field indicates that the probe completed.
