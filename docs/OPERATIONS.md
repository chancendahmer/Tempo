# Tempo operations runbook

## Normal checks

- `/api/health` proves only the web process is alive. Its `configurationScope=web`, build and sending flags describe the web process; they do not attest worker settings.
- `/api/ready` checks PostgreSQL, active per-instance worker attestations, known matching web/worker builds and valid queue health. It rejects blocked accounts, stale inbound backlog and outbound submissions awaiting reconciliation. A live legacy worker without attestation is not reported ready. Fresh runtime readiness is separate from proof of disabled coaching: any observed stale/unretired evidence makes `policyKnown=false` and `allCoachingDisabled=false` even if fresh workers are ready. `workerAttestation` exposes only validated aggregate booleans/counts/builds, never account/canary IDs, worker IDs or secrets.
- Set the same `TEMPO_BUILD_SHA` (7–40 hexadecimal commit characters) on web and all workers, or verify a valid deployment-provided `RAILWAY_GIT_COMMIT_SHA` is present on each. Unknown or mismatched builds fail readiness while web liveness remains available. Mixed deployment versions require operator review; restart every intended worker and confirm the deployed instance count outside Tempo too.
- With `DATABASE_URL` already supplied in the secure operator process environment, run `npx tsx scripts/pilot-operations-report.ts --hours 24`. It opens a repeatable-read **read-only** SQL transaction with a five-second statement timeout. It reports account/onboarding counts, recent delivery failures and all-time held work, due actions, queued/failed jobs, worker policy/build evidence and recovery-audit counts. It never starts pg-boss, migrates, retries, sends, loads environment files or prints phones, message bodies, IDs, tokens, raw errors or invite/canary lists. The window is 1–168 hours; held backlog is intentionally not hidden by that window. Exit 0 means no reported problems, 2 means review the reported operational/attestation problems, and 1 means the report could not complete. An absent queue schema is reported unknown, never initialized by the report.
- `npm run context:report` shows recent policy decisions and hard-block reasons.
- `npm run beta:report` shows masked per-user and aggregate intervention outcomes.
- Railway receives Tempo's single-line Pino JSON logs. Filter `@level:error`, `calendar sync failed`, `job queue error`, and `intervention delivery failed`.

Configure Railway project webhooks for failed/crashed deployments. On Railway Pro, add CPU, memory, disk, and egress monitors in each environment. Railway's built-in resource metrics do not include product KPIs, so Tempo's database reports remain the V1 source for outcome metrics.

## Safety response

For unexpected or inappropriate outbound messages:

1. Stop **every worker instance** to halt queued execution. If every application path that can trigger provider messages must halt, also suspend web signup/verification entry points or stop the web service: signup can request a provider verification message directly. Use deployment controls; environment edits take effect only after a restart. Already accepted provider submissions can still arrive; stopping Tempo cannot recall them. Preserve their ledger state for reconciliation and preserve provider-side carrier suppression.
2. Before restarting, set `AUTONOMOUS_SENDING_ENABLED=false`, `INTERVENTION_SHADOW_MODE=true`, **`CLEANUP_CHECKINS_ENABLED=false`**, and clear `PROACTIVE_CANARY_USER_IDS` on all workers. A nonempty canary list overrides the global coaching switches; cleanup has an independent release switch. Disable/close new admission as needed using the pilot admission controls.
3. Restart only the intended workers with known matching build stamps. Verify fresh `/api/ready` worker attestations, `workerAttestation.allCoachingDisabled=true`, zero aggregate canaries and both proactive/cleanup permissions false. A missing, stale, malformed or unknown-build attestation is not proof that sending is disabled. Check deployment inventory as well: instance heartbeats describe observed processes, not an authoritative inventory of every external deployment. `/api/health` alone cannot confirm worker safety.
4. These coaching permissions do not disable requested reminders, assistant replies, sign-in or compliance paths. Keep workers stopped when the incident requires all application-originated sending to remain halted; do not re-enable them merely because the coaching verdict is disabled. STOP/HELP handling and provider carrier suppression remain separate requirements.
5. Inspect `context_snapshots`, `interventions`, `conversation_messages`, and `intervention_outcomes` securely before changing policy. Do not paste raw user data into incident reports, reset uncertain submissions to reserved or bulk replay failed work.
6. Do not re-enable coaching until the founder signs the launch checklist and the intended policy/build is attested. The reader inspects at most 22 heartbeat rows across unretired history, supporting twenty fresh instances plus compatibility/overflow evidence. Bounded inventory overflow cannot prove disabled policy. Graceful shutdown removes only its exact instance record after its heartbeat write settles and pg-boss reports no remaining application worker loops. A timeout/crash leaves its record; old timestamps are **never automatically treated as termination or deleted**. Independently verify that process stopped before an authorized operator retires its exact record. The read-only report never retires records. This observed-instance verdict still requires an external deployment inventory check; absent/unobserved processes cannot be certified by a database heartbeat.

STOP/revoked consent is enforced again immediately before every provider send. A provider, calendar, or LLM failure cannot bypass that gate.

“Leave me alone” is a seven-day coaching pause, not a consent revocation. It blocks application-originated messages until `paused_until`, schedules one evaluation at expiry, and can be ended early by an explicit resume command. STOP and its carrier aliases remain authoritative and require the carrier-approved opt-in path to reverse.

## Provider failures

- **Sendblue outage, blocked line, or exhausted sandbox contacts:** pause new signups and autonomous sending. Do not bulk replay ambiguous failures; Tempo's message ledger intentionally favors no duplicate message. Compare Tempo's masked message records with Sendblue message handles before retrying manually.
- **Optional Linq or Twilio outage:** keep the fallback disabled unless its credentials, compliance, and end-to-end matrix are current. Switching providers is an explicit operational decision, not an automatic retry of an ambiguous send.
- **Google outage or revoked token:** calendar jobs fail independently from inbound SMS. Mark persistent authentication failures `requires_reauth`; never infer that missing calendar data means free time.
- **Anthropic outage:** intervention composition uses a deterministic, safety-validated fallback. The reviewer/composer have fifteen-second deadlines and no SDK retries. Assistant parsing has its own bounded retries and can persist a transparent unavailable response; do not assume every provider failure leaves the inbound pending. Actual failed jobs retain durable recovery state for operator review.
- **PostgreSQL outage:** web readiness fails, worker jobs stop durably, and the liveness endpoint remains available for diagnosis.

## Backup and restore

Enable Railway PostgreSQL point-in-time recovery in the database service's Backups tab before the beta. Railway's current managed flow uses rolling full/incremental backups and restores into a sibling service at the selected timestamp.

Before launch and monthly during beta:

1. Restore the latest backup into a new isolated database service.
2. point a one-off shell at the restored `DATABASE_URL`;
3. run `npm run db:migrate`;
4. run read-only counts for users, consent records, tasks, messages, interventions, and outcomes;
5. record restoration time and row-count differences;
6. delete the isolated restore only after the drill is documented.

Never test restores against the production database. Encryption-key backup is equally important: without the matching `FIELD_ENCRYPTION_KEY`, restored OAuth tokens cannot be decrypted.

## Data requests

- Calendar disconnect erases cached busy windows and stored Google tokens.
- Account deletion is a confirmation-gated hard delete with database cascades.
- Memory corrections are source-traced and either supersede or soft-delete the prior entry.
- Do not export raw messages, phone numbers, or memory content into tickets or screenshots.

## Held inbound recovery

Inspect queueProblems from /api/ready and the worker queueHealth log. An outbound submission marked ambiguous or left submitting may already have reached the provider. Compare the provider's receipt with the account-scoped message before reconciling; do not reset it to reserved or resend on a guess. New readiness checks can expose old failures after migration. Do not delete history to make readiness green.

For a terminal failed inbound job, use a securely configured process environment and run:

```text
npx tsx scripts/recover-inbound.ts --user ACCOUNT_UUID --job JOB_UUID --operator NAME --reason "Verified failure cause and provider state"
```

Default is dry run. Add --apply only after reviewing the selected account/job and provider evidence. The command checks job/action/message ownership, lease expiry and outbound state, and records the operator/reason. It refuses uncertain provider submissions. Do not automatically retry every failed job. Configure an external monitor for /api/ready before an unattended pilot; logging alone does not notify an operator.
