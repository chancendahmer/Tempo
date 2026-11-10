# Hosted release audit

This checklist covers the production baseline at `86ae010` and the candidate through additive migration `0035`. The console probe reads the running process and PostgreSQL metadata. Railway inventory, backup, alerting, provider billing and deployment history require separate evidence from the corresponding operator views.

## Observed production worker baseline

The operator's read-only Railway worker probe matched the effective runtime and Railway Git stamps to `86ae01023abcf24bcc8da9ed9d367192e14a29ae`. PostgreSQL returned 29 ledger entries and verified the complete ordered prefix through `0028`. The snapshot contained one fresh legacy worker heartbeat.

The observed worker used default open admission with zero configured invitees, shadow mode on, autonomous sending off, cleanup check-ins on, and one proactive canary entry. AI budgeting was off. Provider key-pair and webhook secret presence checks passed. This establishes only the worker baseline. Web settings, complete replica inventory, enforcement, and hosted recovery still require separate evidence.

## Before rollout

- Verify the deployed web and worker commit stamps, Railway service roles, source branches, configuration file paths, replica inventory and PostgreSQL service reference in the intended environment. Record the public commit hashes and deployment times. Both service paths should target the same database. Keep project, deployment, database and replica identifiers in Railway.
- Run the read-only probe in both runtime consoles. Require an exact ordered journal and SQL digest prefix. The `86ae010` source ships through `0028`. A later exact prefix requires a documented migration source. A missing, unknown or divergent prefix blocks rollout. Confirm `0033` accounting, `0034` receipt inbox and `0035` disposition table presence agrees with the recorded prefix.
- Confirm the production database's latest successful backup, timestamp, retention and recovery options in Railway. Record actual PITR availability and recoverable window where applicable. Demonstrate restoration to an isolated database and verify its ledger and application compatibility. Agree on recovery ownership and limits. Local PostgreSQL tests and an application catalog probe do not establish hosted recovery.
- Verify the live effective settings in both service roles. Confirm public HTTPS, the shared existing encryption key, the correct provider and webhook setup, and the Google callback at the canonical origin. Use invite-only admission and check that the approved roster matches privately. Keep shadow mode on and autonomous sending, cleanup check-ins and proactive canaries off for the first rollout. Configured key presence does not prove a credential works or matches across services.
- Obtain approval for paid usage and retention before enabling a metered canary. Verify the same enforced policy across every AI-producing web and worker instance, including pinned model, current price snapshot, approved daily money and call caps, and direct provider route. Confirm provider billing and alert ownership. An environment variable on the old build does not enable candidate enforcement. The candidate's checked-in price snapshot requires review by 2026-11-22 00:00 UTC.
- Keep the exact historical approval separate from release approval. The proposed close manifest covers 35 unresolved deliveries across two accounts. Its reviewed fingerprint begins `aaddd2dd3a46`. Require the full exact digest and explicit acknowledgment through the disposition command before recording any events. Re-run the dry-run after migration. Verify that pending uncertainty excludes only the approved unchanged historical rows and continues to detect new uncertainty or reactivated linked work.

## Rollout verification

- Confirm the pinned candidate revision and successful checks before an authorized deployment. Verify the web and worker pre-deploy commands use the shared advisory-lock migration runner. Recheck the resulting exact `0035` prefix and required schema objects before traffic or worker activity is resumed.
- Confirm matching web and worker build stamps, fresh worker attestations and retirement of the old replicas in Railway. Verify `/api/health` for web liveness and `/api/ready` for database, worker and queue readiness. Check worker logs and the operations report for unresolved submissions, failed or stalled jobs, failed or unobserved metering, and receipt overflow. A healthy endpoint does not establish complete platform inventory or prove provider delivery.
- With the approved pilot accounts and budget, verify a signed inbound SMS, the correct account's durable record and the resulting workspace update. Verify authenticated carrier status, independent provider billing reconciliation when applicable, and an alert reaching its intended operator. Keep admission and sending controls in force until each required live gate has evidence.

## Rollback

- Agree on the rollback owner, compatible web and worker build pair and stop conditions before deployment. Stop the affected sender or worker for new ambiguity, consent or account isolation failure, mismatched builds, or unmetered paid activity.
- Before restoring a build without enforcement, stop all affected AI-producing traffic and workers. Keep admission and autonomous sending controlled. Restore a compatible code pair with the additive schema and ledger intact. Verify the code stamps, worker state and queue again. Reconcile any uncertain outbound attempts or unsettled AI charges without replaying them.
- Use an approved and verified hosted restore only when data recovery is required. The ordinary code rollback retains the migration ledger, receipt inbox, disposition audit and accounting history.

The probe source is `release-preflight.ts`. It reports allowlisted release metadata and fixed aggregates from a bounded read-only PostgreSQL snapshot. Its `ok` field indicates that the probe completed.
