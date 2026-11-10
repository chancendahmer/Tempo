# Hosted release audit

This checklist covers the production baseline at `86ae010` and the candidate through additive migration `0035`. The console probe reads the running process and PostgreSQL metadata. Railway inventory, backup, alerting, provider billing and deployment history require separate evidence from the corresponding operator views.

## Observed production worker baseline

The operator's read-only Railway worker probe matched the effective runtime and Railway Git stamps to `86ae01023abcf24bcc8da9ed9d367192e14a29ae`. PostgreSQL returned 29 ledger entries and verified the complete ordered prefix through `0028`. The snapshot contained one fresh legacy worker heartbeat.

The observed worker used default open admission with zero configured invitees, shadow mode on, autonomous sending off, cleanup check-ins on, and one proactive canary entry. AI budgeting was off. Provider key-pair and webhook secret presence checks passed. This establishes only the worker baseline. Web settings, complete replica inventory, enforcement, and hosted recovery still require separate evidence.

## Before rollout

The founder approved the exact historical disposition below. An encrypted
production snapshot was successfully
restored to an isolated PostgreSQL 18.6 clone; original aggregates and the exact
0028 ledger matched. The pinned candidate migrated the clone through 0035 and a
second migration run was unchanged. The clone was stopped and transient plaintext
retired. This establishes one recovery point; scheduled backups/PITR are still
unavailable on the observed plan. See `logical-backup-restore.md`.

The running worker's allowlisted model probe returned `claude-sonnet-4-6`. The
candidate uses this model for the primary parser and Haiku 4.5 for separately
metered hosted search. The same v2 pricing policy must be effective on both web
and worker. The hosted observations below record the applied disposition and
readiness recovery.

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
requires no network request. The lead recorded the hold at $7.902717 previously
committed, for **$16.902717 committed** of the $20 authorization. The remaining
independent QA headroom at that point was **$3.097283**. Read the actual journal
balance before further tests. The $1 carrier hold is already in
the balance. Count each request once and track hosted attempts within the held
$9. The limits apply per UTC day, and outstanding debt remains reserved. Pause
the hosted test allowance at the end of verification or before midnight UTC,
whichever comes first, unless the approved ongoing policy takes effect.

The founder separately approved ongoing **$10 aggregate per UTC day** across
all accounts after testing. For the final main rollout, set both
`AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS` and
`AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS` to `10000000` on web and worker. Keep
`AI_BUDGET_MODE=enforce`, v2 pricing and the 100 global and 60 account daily
call caps. Verify matching settings on the final builds. The production ledger
carries existing same-day settled usage into the new caps. The central $9 hold
continues to account for the bounded hosted test allocation.

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

## Observed candidate cutover

The lead's worker-console preflight identified `c732093556f941fb9a4daae7c8ce137ba5851dc5`
and matched the exact 36-entry ledger through `0035`. The accounting, receipt
inbox and disposition tables were present. It observed one fresh worker and one
fresh web heartbeat at the matching build. Worker configuration showed valid v2
metering, all five primary operation models on Sonnet 4.6, hosted search on
Haiku 4.5, $9 global and account money caps, 100 global calls and 60 account
calls per UTC day. Invite-only admission had an empty roster. Shadow mode was
on, autonomous and cleanup sending were off, and the proactive canary list was
empty.

The exact manifest passed post-migration preview and default dry run. The
approved append-only disposition applied once. The read-only audit of the same
manifest confirmed it was recorded and the delivery states were unchanged.
Hosted `/api/ready` then returned HTTP 200 with 35 unresolved outcomes, 35
acknowledged historical cases and zero pending. It reported one fresh matching
worker, zero stale and zero unknown. The lead retained the private console and
readiness evidence. [Historical audit](outbound-history-review.md)

The lead separately checked the Railway web and worker Deployments views. Each
showed one active candidate replica, with its previous deployment marked
Removed. The direct web-console preflight matched `c732093`, exact `0035`, and
the same v2 policy, model choices, caps and safety settings as the worker. Its
heartbeat snapshot contained three rows and one fresh web row, with zero fresh
worker rows at that instant. The worker writes its instance row and one shared
compatibility row. The web process writes its own instance row. The preflight
compares heartbeat times against the transaction's two-minute window, which
excludes both old rows and rows newer than its upper timestamp. That capture
contains no signed ages to identify which bound excluded the worker rows. The
22:46 UTC readiness check then showed HTTP 200, a matching worker heartbeat
aged three seconds, and zero stale or unknown instances.

The post-reminder 22:48:30 UTC compact operations snapshot observed one fresh
matching web and worker, zero stale or unknown workers, and matching registered
policy. Eleven hosted calls settled for 305,388 microdollars, with zero
outstanding or violated reservations. Pending inbound and outbound, failed
jobs and actions, receipt inbox count and quota drops were all zero. Its two
warnings reflect the report's built-in distinction between observed instances
and independently verified platform inventory and approved caps. The operator
verified those facts separately in the Railway views and console preflights.

The authorized demo SMS saved a task and a scheduled reminder. The open
workspace picked up the task automatically and preserved it on reload. A
separate Calendar request proposed the edit, received explicit YES, and showed
the created event in the Tempo Google Calendar agenda. At 5:48 PM EST the
actual reminder appeared in TextFree and the workspace showed Sent. The phone
receipt proves arrival for that demo occurrence. The owner-scoped ledger since
22:30 UTC showed seven Sendblue messages with accepted submissions, Sent status
and exact provider bindings, including one linked to the owned reminder. It
showed zero ambiguous submissions, matched pending receipts or recorded
Delivered/Read receipts in that snapshot. The authenticated webhook maps SENT
and DELIVERED/READ as distinct statuses. The lead then confirmed
removal of the disposable Calendar event by replying YES after the intervening
reminder. Tempo confirmed removal at 5:49 PM EST. Reloading Google Calendar's
November 11 agenda showed the disposable event absent.

The 5:50 PM EST live SMS search for the NIST Internet Time Service returned
NIST and time.gov links. The read-only hosted ledger slice from 22:30 UTC
recorded one settled Haiku 4.5 assistant attempt with one authoritative search
request for **$0.022950**. The twelve settled Sonnet attempts comprised seven
assistant, two task-presentation and three authorization calls. All 13 settled
attempts in that creation-time slice cost **$0.449789**, with zero outstanding.
The console verified the direct provider route. These costs are covered by the
$9 hosted hold.

## Rollout verification

- Freeze the candidate after the integrated checks. Deploy it to the existing Railway web and worker services using their normal pre-deploy migrations. Require the exact 36-entry ledger through `0035`, matching pinned build and effective configuration, fresh web and worker attestations, and retired old replicas. The old `86ae010` build lacks both invite admission and AI metering. Retire its AI-producing processes before starting the paid demo.
- Verify `/api/health` and `/api/ready`. Recheck the operations report for new outbound uncertainty, receipt overflow, failed or stalled jobs and accounting errors. Use existing Railway deployment status and logs alongside readiness for attended operator review. Compare an observed degraded readiness response with recovery after the authorized disposition when both are available. This is an attended check. The repository does not provide automatic operator notification. Verify carrier status, and reconcile authoritative provider usage against the ledger and the held test allowance. Invoice-console access is unverified. Recheck the same build and readiness after publishing the approved main revision.
- From the authorized demo account, send one uniquely named task request with a reminder at an explicit near-future local time in the permitted window. Require one owned task and scheduled reminder in the workspace after reload, then observe actual phone delivery and its carrier status. Verify the task and reminder remain separate.
- Request one uniquely named Google Calendar event at an explicit date, time and time zone. Verify the proposal precedes the write, confirm through the normal flow, and see the exact event in Google Calendar and the workspace after reload. Remove that disposable event through the normal confirmed flow and verify its absence.

## Rollback

The November 10 hotfix also requires a compound request with **in two minutes**:
verify the owned persisted receipt + 120 seconds equals both reminder and job
due times, observe the local display and actual demo-phone arrival, reload the
saved thought, and remove only that disposable thought. Candidate `36f7f27`
passed these checks; the independent bounded score is 9/10. The exact results,
old-replica archive digests and remaining main rollout are recorded in
`docs/PILOT_RUN_2026_11_10.md`. Match both final-main runtime stamps and verify
old replicas Removed before archiving their exact heartbeat manifests.

- To pause candidate paid calls, retain `AI_BUDGET_MODE=enforce` and the v2 price version, and set both daily money caps and both daily call caps to `0` across all AI-producing roles. Verify the paused configuration took effect. Keep invite-only admission, shadow mode on, autonomous and cleanup sending off, and the proactive canary list empty.
- If reverting to `86ae010` or another build without enforcement, stop paid ingress and workers before reverting. Those builds lack the candidate pause controls. Preserve the compatible web and worker pair, additive schema, receipt inbox, historical dispositions and accounting records. Verify code stamps and queue state, and reconcile uncertain outcomes without replay.
- Use the verified encrypted recovery point when data recovery is required. The restored snapshot and clone rehearsal establish one recovery point. The observed Railway plan lacks scheduled backups and PITR. [Recovery drill](logical-backup-restore.md)

The probe source is `release-preflight.ts`. It reports allowlisted release metadata and fixed aggregates from a bounded read-only PostgreSQL snapshot. Its `ok` field indicates that the probe completed.
