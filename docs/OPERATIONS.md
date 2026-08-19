# Tempo operations runbook

## Normal checks

- `/api/health` proves the web process is alive and exposes the two sending safety switches.
- `/api/ready` proves PostgreSQL is reachable and the worker heartbeat is under two minutes old.
- `npm run context:report` shows recent policy decisions and hard-block reasons.
- `npm run beta:report` shows masked per-user and aggregate intervention outcomes.
- Railway receives Tempo's single-line Pino JSON logs. Filter `@level:error`, `calendar sync failed`, `job queue error`, and `intervention delivery failed`.

Configure Railway project webhooks for failed/crashed deployments. On Railway Pro, add CPU, memory, disk, and egress monitors in each environment. Railway's built-in resource metrics do not include product KPIs, so Tempo's database reports remain the V1 source for outcome metrics.

## Safety response

For unexpected or inappropriate outbound messages:

1. Set `AUTONOMOUS_SENDING_ENABLED=false` on the worker immediately.
2. If any uncertainty remains, also set `INTERVENTION_SHADOW_MODE=true`.
3. Redeploy/restart the worker and verify `/api/health` reports the safe values.
4. Inspect `context_snapshots`, `interventions`, `conversation_messages`, and `intervention_outcomes` before changing policy.
5. Do not re-enable until the founder signs the launch checklist.

STOP/revoked consent is enforced again immediately before every provider send. A provider, calendar, or LLM failure cannot bypass that gate.

“Leave me alone” is a seven-day coaching pause, not a consent revocation. It blocks application-originated messages until `paused_until`, schedules one evaluation at expiry, and can be ended early by an explicit resume command. STOP and its carrier aliases remain authoritative and require the carrier-approved opt-in path to reverse.

## Provider failures

- **Sendblue outage, blocked line, or exhausted sandbox contacts:** pause new signups and autonomous sending. Do not bulk replay ambiguous failures; Tempo's message ledger intentionally favors no duplicate message. Compare Tempo's masked message records with Sendblue message handles before retrying manually.
- **Optional Linq or Twilio outage:** keep the fallback disabled unless its credentials, compliance, and end-to-end matrix are current. Switching providers is an explicit operational decision, not an automatic retry of an ambiguous send.
- **Google outage or revoked token:** calendar jobs fail independently from inbound SMS. Mark persistent authentication failures `requires_reauth`; never infer that missing calendar data means free time.
- **Anthropic outage:** intervention composition uses a deterministic, safety-validated fallback. Task-intent parsing retries and retains the inbound message for later processing.
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
