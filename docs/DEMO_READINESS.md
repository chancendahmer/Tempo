# Tempo demo readiness

Status: a live single-account demo under iterative evaluation, not a verified
consumer release. Passing mocked tests does not prove live release gates passed.

September 30 live checkpoint: [LIVE_DEMO_JOURNEY.md](LIVE_DEMO_JOURNEY.md)
records a real phone-verified demo account, connected Google Calendar and
confirmed event creation/rescheduling with dashboard readback. Real scheduled
SMS delivery, autonomous coaching, automatic focus launch/completion, routines,
full recipe meal planning and short time answers interrupted by a reminder have
passed live checks. Personal recall and exact task-move failures kept the
earlier score below five until deployed replay. PR 16 replay then passed real SMS
note recall, the exact Saturday move with goal/duration preserved and repeat
groceries without new duplicates. The mediated reviewer rates the controlled
demo 8.2/10 and commercial readiness 6.6/10. PR 16 repairs passed the
full check. Subsequent PR 19 passed 448 tests across 68 files, lint, typecheck and
production/operations builds; live prioritization then correctly distinguished
overdue recycling, tomorrow's dentist task and later-week activities. The real
SMS automatic-contact explanation correctly reported existing consent and caps.
Public OAuth readiness, native scheduled alarms and hardware brightness,
actual installation, camera scanning and a real twenty-account load remain gates.

Earlier checkpoint: [INDIRECT_DEMO.md](INDIRECT_DEMO.md) records two real-model
25-turn indirect-language runs and a real TextFree signup diagnosis. Anthropic
credits now work. The second run passed all state checks, with remaining reply
quality issues recorded separately. A missing Sendblue shared-line route was
identified; creating it and retrying START produced real verification and welcome
messages. Google authorization subsequently passed in the separate demo account;
the current remaining live checks are recorded above. The historical checkpoints below describe earlier
states and must not be read as the latest provider availability.

September 29 evaluation: see [DEMO_ITERATIONS.md](DEMO_ITERATIONS.md) for the
mixed SMS/web journey, 20-account context checks, fixes and readiness ratings.
Run `npm run simulate:workspace -- --scripted` for state-path snapshots, or omit
`--scripted` with configured model credentials for live synthetic conversations.

## Workspace checkpoint — September 28, 2026

`/workspace` and `/board` now render the authenticated workspace. `/workspace/preview`
is an interactive, explicitly labeled sample with in-memory changes that reset
on reload. It never pretends to invoke the live assistant or food service.

The workspace includes tasks, goals, a Google event agenda, daily routine steps,
a persistent focus timer, recipe library, dated meal plans, groceries, nutrition
and food diary, workouts, thought inbox, shared conversation, and settings.
The planner uses soft section-specific colors and the existing Tempo avatar.
The visual refresh adds illustrated routine/meal cards, colored nutrient tiles,
bordered event groups, note cards, concise chat shortcuts and expandable help.
Desktop and mobile browser checks cover section navigation, ingredient disclosure
and routine checkoffs; the focus interaction remains unchanged.
Browser full screen and user-triggered spoken briefings depend on device support.
Scheduled spoken announcements, kiosk recovery and display pairing remain gaps.

All authenticated edits use the same PostgreSQL account as SMS. Web conversation
messages enter the durable inbound job pipeline and use the same orchestrator
and tools. Web replies are persisted without sending an extra carrier message.
Workspace polling refreshes every 15 seconds; calendar events every 60 seconds.
Failures clear private workspace content. Hide is visual privacy, not a device lock.
Calendar edits retain the existing confirmation gates and supported-event limits.

Migration 0022 adds versioned account-owned life items, replay receipts, a shared
food cache and a unique active-focus index. Its generated snapshot is checked in.
Apply `npm run db:migrate` before deploying the web and worker versions together.
Task/goal mutations use their existing audited repositories. Recipe, routine,
meal, food, workout, grocery and note tools support SMS and web assistant input.
Routine completion uses the account timezone; stale edits fail instead of silently
overwriting another device. Recipe storage is separate from generic AI memory.

Food name and barcode search use Open Food Facts with attribution, explicit
portion units, unknown nutrient values, cache and database-backed rate limits.
Camera scanning requires a secure browser with BarcodeDetector support; typed or
USB-scanner barcode entry and manual food entry remain available. This is Tempo's
own food diary, not a MyFitnessPal account integration. Before public launch,
review Open Food Facts usage requirements and bulk-data options for higher volume.
The current bounded workspace reads are a prototype, not unlimited-history browsing:
200 tasks, 100 goals, 1,000 life items and the latest 50 messages. Pagination and
long-term archival need implementation before heavy multi-year use.

`npm run check` passed lint, typecheck, 247 tests across 49 files, production
build and operations compilation. The 33-turn scripted assistant simulation
reported zero state-check issues. These are isolated code-path checks.

Verification includes migrated PostgreSQL-compatible integration tests for account
isolation, stale versions, retries, task completion, routine focus completion,
web ingress/replies and scripted recipe tool routing. Browser checks cover task
start/pause/done, food reuse, recipe creation, meal planning, calendar layout and
a 390px mobile layout. Preview interactions are not live integration evidence.

Live model simulation previously stopped before calls because ANTHROPIC_API_KEY
and ANTHROPIC_MODEL were absent from the process environment. A direct public
food-barcode lookup also failed to connect from this environment. Real Google
OAuth, model replies, carrier delivery, worker recovery and whiteboard camera/audio
still require a configured deployment canary. No production migration or deployment
was performed. Existing recurring reminders and proactive opt-in gates remain in
place; defining a routine alone does not schedule its own SMS or audio announcement.

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
