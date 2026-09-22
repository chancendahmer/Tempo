# Tempo demo readiness

Status: a locally validated demo candidate, not a verified consumer release.
Live model quality, real SMS delivery, and the founder canary remain release
gates. Passing mocked tests does not prove those gates passed.

## Required before inviting testers

- Sendblue receive and outbound webhooks point to the public URL and use the
  same signing secret.
- Anthropic billing, an API key, and a model ID are configured. Web search is
  enabled by default through `ASSISTANT_WEB_SEARCH_ENABLED=true`; it is capped at
  two searches per request and must be disabled if the account does not permit
  server web search.
- `DATABASE_URL` and the same 32-byte `FIELD_ENCRYPTION_KEY` are present in
  both Railway services. Never copy either value into chat or Git.
- `INTERVENTION_SHADOW_MODE=true` and `AUTONOMOUS_SENDING_ENABLED=false` remain
  set while the founder canary is running.
- Google OAuth has the redirect URI in `docs/SANDBOX_DEMO.md`. Calendar users
  must reconnect after this release to grant personal event access; old
  free/busy-only connections can still inform scheduling but cannot edit events.

## What the SMS assistant supports

Tempo can converse normally, remember and recall non-sensitive preferences,
keep a favorite-food list, suggest meals, create/list/update tasks and goals,
schedule, reschedule, complete, and cancel reminders, search current web information when enabled,
read Google Calendar, and propose confirmed edits to individual timed personal
events. A calendar change is never applied from a single model response: the
user receives a summary and must reply `YES`.

Optional proactive check-ins require an explicit user request. They use the
existing consent, quiet-hours, calendar, pending-response, daily-cap, and
cooldown gates. A separate `proactive_opt_in` flag defaults to false for new
and existing accounts. The hard limit is three interventions per local day,
with at least two hours between interventions. Explicit reminders use their
own delivery path.

## Not connected in this release

Email, Apple Calendar, Google Tasks, shopping, health data, location, and
arbitrary third-party apps have no provider adapter yet. Tempo reports these as
unavailable and does not claim an action occurred. Add an adapter, OAuth scope,
repository boundary, and integration test before enabling one.

## Acceptance sequence

Run `npm run check`, `npm run smoke:staging`, and the founder canary in
`docs/SANDBOX_DEMO.md`. Test the following in one conversation: `Hello`,
`Who are you?`, favorite-food setup followed by a food, a one-minute reminder,
`list my reminders`, a task create/complete pair, a current web question, and
calendar lookup. Confirm that repeating an old message never repeats its old
confirmation and that `NO` leaves a calendar proposal unchanged.

## Conversation simulation without sending SMS

Run `npm run simulate:assistant -- --scripted` to exercise 33 synthetic turns,
an old webhook replay, malformed media, and a separate user's memory lookup.
The same Sendblue parser, inbound persistence, conversation orchestrator,
repositories, and outbound sender are used against a temporary PGlite database
and a capturing transport. Scripted model replies are explicitly labeled.

Run `npm run simulate:assistant` with `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`
already available in the process environment to use the real Anthropic adapter.
The script does not load secret files, use `DATABASE_URL`, send real SMS, or
change Google Calendar. Calendar responses are fixtures even in live mode.
Only synthetic prompts are sent to Anthropic; ordinary API/search charges apply.
Missing model configuration fails before any call rather than silently using
fixtures. Use the provider's configured model ID; do not guess one.

Outputs are `qa/assistant-live-latest.md` and `.json`, or
`qa/assistant-scripted-latest.md` and `.json`. The transcript contains exact
captured replies, tool names, timing, and state-check failures. Read live
transcripts for relevance, contradictions, repeated confirmations, source
quality, and reply length; automated state checks do not grade those qualities.
Scripted timings measure local code, not provider or carrier latency.

`npm run test -- src/server/testing/assistant-simulation.integration.test.ts`
also tests twenty concurrent synthetic users, isolation, retries, expiry,
calendar cancellation, and reminder changes. It does not exercise pg-boss or
real network latency; the founder canary must cover worker execution/delivery.

## Deployment and rollback

Migrations 0020 and 0021 add explicit proactive opt-in, change the default
cooldown, and add the completed reminder status. They preserve existing data.
Use the normal journaled `npm run db:migrate`; do not manually reapply raw SQL.
Apply migrations before starting the new web/worker versions. Railway web uses
the compiled migration pre-deploy command; coordinate worker rollout after it.
Integration tests apply every migration to an empty isolated database.

Before a canary, both services must have `INTERVENTION_SHADOW_MODE=true` and
`AUTONOMOUS_SENDING_ENABLED=false`. On 2026-09-15 the supplied production URL
returned healthy web/database/worker results, but reported autonomous sending
enabled; the staging smoke command failed its safety gate. That observation
does not verify this unshipped branch.

For rollback, disable autonomous delivery, stop the new worker, and redeploy
the prior known-good web and worker revisions. Keep the additive migrations;
do not drop columns or enum values containing data. Older application code may
not enforce the new opt-in flag, so keep autonomous delivery disabled throughout
rollback. Use a tested database backup only if data restoration is required.

## Privacy and remaining release gaps

OAuth tokens and calendar proposal tokens use the 32-byte encryption key.
Ordinary message bodies and non-sensitive memory are currently database text;
the secret-memory guard is a heuristic, not comprehensive sensitive-data
detection. Do not claim all user data is application-encrypted.

`Forget …` excludes matching memory from retrieval; it generally soft-deletes
records, while food-list edits preserve unrelated foods. Account deletion uses
a signed link and explicit DELETE confirmation, followed by database cascades.
Backups require a documented retention/deletion policy. A complete self-service
memory export and automatic retention purge have not been implemented.
Disconnecting Calendar clears stored tokens and cached busy windows; reconnect
through Extensions to grant event scopes.

Other release gates: live Anthropic transcripts, real Sendblue delivery/retry
canary, current web citations, connected Google OAuth read/edit checks, worker
queue recovery under load, and operator monitoring. Provider acceptance followed
by a lost network response remains an ambiguous-send case; local deduplication
alone does not prove exactly-once delivery at the carrier. Review before inviting
paying consumers. Missing adapters are listed above.
