# Candidate runtime and provider audit — October 18, 2026

This is a source/configuration audit of `codex/tempo-calm-ui` at
`d1d866c7d56c0a63fa491c0cdb43fd843a5a4140`. It supplements
[the checkpoint](UI_RELEASE_CHECKPOINT.md) and
[backend compatibility notes](UI_RELEASE_BACKEND_NOTES.md). It is not a
deployment approval or evidence of live SMS/Google acceptance. No deployment,
external account, populated secret file, production database, or paid provider
was accessed. Only this document is an authored change from this audit.

## Smallest viable full candidate canary

Use a separate Railway environment containing candidate web, candidate worker,
and a new empty PostgreSQL database. Pin both application services to the same
tested candidate SHA. Use the existing `railway.web.toml` and
`railway.worker.toml`; both already invoke the journaled migration runner.
The branch adds no SQL migration or `schema.ts` change relative to the locally
available `origin/main`; an empty environment still needs the full journal.

Give this environment its own encryption key and HTTPS origin. Web and worker
must share that environment's database, encryption key, Google client settings,
and application URLs. Set `APP_BASE_URL` to the candidate origin and
`GOOGLE_REDIRECT_URI` to its `/api/auth/google/callback`. Production-mode
configuration enforces the same HTTPS origin for both URLs
(`src/server/config/env.ts:82`). Register that exact redirect with Google and
authorize the dedicated demo Google account afresh in the candidate. A Google
client can be reused only if its owner adds the candidate callback safely;
do not copy production token rows or browser sessions into candidate storage.

SMS requires a candidate-owned provider account or a demonstrably independent
line and webhook route. Preserve production callbacks. With Sendblue, confirm
whether receive/outbound webhook configuration applies to the entire account
before making any provider change. The checked source does not establish that
provider-side scope. A second URL or a private preview link alone does not
isolate a production provider account. The candidate must receive only its
dedicated demo traffic and send only to the agreed demo recipient.

Start with `INTERVENTION_SHADOW_MODE=true`,
`AUTONOMOUS_SENDING_ENABLED=false`, `CLEANUP_CHECKINS_ENABLED=false`, and an empty
`PROACTIVE_CANARY_USER_IDS`. Keep `ASSISTANT_WEB_SEARCH_ENABLED=false` for the
bounded acceptance sequence. Verify these settings in both services; health
and staging smoke do not expose/check every one of them. Keep candidate signup
private and observe that only the intended demo user exists before starting
the normal worker. Private sharing is an operational restriction, not a
code-enforced signup allowlist.

Do not duplicate production PostgreSQL into an environment with live provider
credentials. A production copy contains real recipients, due actions and
tokens; an idle-looking worker can become active immediately. Do not attach
candidate web or worker to production PostgreSQL while the old application is
still writing it.

## Why these boundaries are necessary

- `src/worker/runtime.ts:45` always uses queue schema `pgboss`; startup registers
  all handlers, seeds missing context/calendar actions at line 168, performs
  expiry cleanup, and starts the global dispatcher at line 187. There is no
  account-scoped worker startup mode in the checked environment contract.
- `src/server/jobs/dispatcher.ts:28` selects all due scheduled actions across
  supported kinds. A different `WORKER_ID` is an operational identity, not an
  account or queue isolation boundary. Changing only the pg-boss schema would
  still leave the shared `scheduled_actions` dispatcher boundary.
- Autonomous controls gate proactive paths. Explicit reminders, inbound
  assistant replies, sign-in and compliance messages remain active. In
  particular `deliver-reminder.ts` sends through `SafeSmsSender` without an
  autonomous-switch check. This is expected product behavior, not an emergency
  global outbound kill switch.
- `src/app/api/sendblue/webhook/route.ts:22` ingests any valid authenticated
  inbound without restricting its recipient to the configured candidate line.
  `messaging-repository.ts:23` resolves/creates the account by sender and records
  the incoming provider line. Redirecting an accountwide production webhook
  could therefore import unrelated users into candidate storage. Webhook
  authentication does not establish environment isolation.
- `proactive-delivery.ts` allows configured canary IDs despite the global
  proactive switches, and independently enables cleanup delivery when its
  switch is true. Clear those controls explicitly.

An isolated local HTTPS tunnel with independent provider routing could exercise
the same callbacks, but needs durable public routing, an intentionally configured
worker, and OAuth setup as well. The current provider-free local fixture does
not satisfy those conditions. A production-DB preview or merging first is not
a safe shortcut to the remaining candidate gates.

## Lower-cost alternative: separate bounded integration proofs

If no independent provider routing/environment already exists, retain the local
candidate UI and isolated local PostgreSQL and prepare an account-scoped
one-shot integration runner. This can advance evidence without new hosting or
a new SMS line. It cannot close every full candidate release gate.

`scripts/lib/local-web-message-probe.ts:99` already provides the useful pattern:
validate a local QA database, select an exact account/message/action, enqueue
only that action into a private QA queue/schema, run one consumer, verify the
expected state and stop. It deliberately uses `WebReplySender`, omits real
Calendar, and asserts reminders remain undispatched. Use this as a pattern;
do not silently enable providers in the existing synthetic-only probe.

A new reviewed runner would need these concrete limits before use:

- Reject any database except the approved local QA database, and validate the
  exact demo UUID and recipient again immediately before each provider call.
  Do not accept a general account list, due-action query or worker startup.
- Require fresh demo consent and an established current opt-out state before
  sending; do not assume fictional fixture consent represents the actual demo
  recipient. Use `SafeSmsSender` and `DrizzleOutboundMessageRepository` with
  the isolated database and real configured transport, retaining reservations,
  ownership and ambiguous-acceptance handling. Permit one labeled outbound and
  a stable idempotency identity, with no unattended resend.
- For a scheduled-delivery proof, select an exact newly created local reminder
  and matching due action belonging to that demo. Verify its current scheduled
  time/status and run the actual reminder handler through a one-job queue with
  local-only repository configuration. Do not substitute a direct transport
  call and call it a worker-delivery test. The handler currently constructs
  repositories from `getDatabase()`, so environment/database isolation must be
  established before imports and startup, not just passed to a helper.
- Connect the dedicated demo Google account afresh through the candidate's
  OAuth flow. A registered localhost development callback can avoid public
  hosting if the existing Google client permits it; its actual registered
  redirects were not inspected here. Bind candidate web/runner to the same
  local key and database. Use `CalendarAssistantIntegrations(database)` for
  propose/confirm/read/delete so confirmation and supported-event checks remain
  present. Restrict deletion to the newly labeled returned event ID.
- Meter only Anthropic calls with the existing shared ledger contract, while
  explicitly allowing the required non-AI provider calls in a separately
  reviewed transport boundary. A processwide replacement that permits only
  Anthropic will break SMS/Google; Google SDK requests also need independent
  inspection because not every SDK uses global `fetch`. Keep total call and
  operation limits, disable search, stop and reconcile uncertain outcomes.

Using the existing provider line solely for this demo's outbound does not require
moving receive/status callbacks. Its callbacks may still reach the existing
production deployment, and a reply from the demo phone will still enter that
deployment. Do not text back and claim the candidate received it. An observed
TextFree arrival would prove the candidate's outbound adapter and actual
carrier path; a selected real reminder handler adds local scheduling/worker
evidence. Candidate UI plus bounded local web assistant and real Google can
prove their respective local paths. They do not prove normal candidate SMS
ingress, candidate callback persistence, or a complete same-account SMS/UI
round trip. Preserve these distinctions in acceptance scores. This alternative
was proposed only: no runner, OAuth change or provider call was made here.

## Exact sequence once isolation and budget are established

1. Record web and worker deployment SHAs from deployment metadata; a package
   version of `1.0.0` is insufficient. Verify migration completion. Confirm the
   database identity without revealing its connection string. Run
   `npm run smoke:staging` with the candidate `STAGING_BASE_URL` and separately
   verify cleanup/canary settings. `/api/ready` checks database access, fresh
   worker heartbeat and queue health, but not matching application SHAs.
2. Complete normal phone verification/sign-in on the candidate with the
   dedicated demo number. Reconnect only the dedicated demo Google account.
   Confirm the candidate UI displays the expected account identity. Existing
   production sign-in and Calendar success are old-build evidence.
3. Send one freshly labeled note by real SMS. Verify its persisted state in the
   candidate browser after reload. Edit that exact record through the UI, then
   ask by SMS for its new text. Record sanitized record IDs and replies.
4. Request a clearly labeled future Calendar event, check that no event exists
   before confirmation, confirm it, and verify it in both candidate Calendar
   readback and the dedicated Google account. Request deletion, confirm it,
   and verify absence. Retain the exact event ID for cleanup.
5. Request one short scheduled reminder, verify its candidate UI record and due
   time, then observe its actual arrival in the dedicated TextFree inbox.
   Provider acceptance/status callbacks and captured transport are separate
   evidence from inbox arrival. Do not force-reset an ambiguous send or create
   a new retry identity; use the existing reconciliation procedure.
6. Remove only labeled records made by this canary; preserve events, messages,
   receipts, and job history required to interpret the result. Obtain the
   independent acceptance review before changing PR release status or merging.

After the parent's subsequent $0.189555 live browser/model check, the reported
paid allowance is **$4.269385**, with **$5.730615** conservatively committed
against the original $10 total. This audit itself used no paid calls.
The existing uncertain-outcome reserve
must remain committed. Root coordinates every paid call and retry.
`scripts/lib/live-qa-budget.ts` locks and meters only the calling process; it
allows only Anthropic message requests and its token-count preflight. Wrapping
a normal worker with it would reject Calendar/SMS fetches, and it does not meter
other processes. A normal worker has no aggregate QA spending cap. Before
starting a provider-enabled canary worker, establish an effective shared
provider/project budget and exclusive controlled ingress, or prepare an audited
bounded runner that retains the real job/provider paths. Do not restart the
ledger or assume the local probe wrapper caps a deployed worker. Current source
alone does not establish that remaining funds can cover all live gates.

## Compatibility and rollback

The earlier backend notes remain applicable: new JSON kinds and optional
metadata use existing tables, and old writers can reject or strip candidate
fields. Deploy web and worker together at the same tested revision. Workspace
GET calls `refreshMealGroceries` before returning state and can update/delete
derived grocery rows; preview browsing against production is therefore not
database-read-only acceptance.

Before production rollout, record actual deployed revisions and migration
journal state and establish a recoverable backup with its matching encryption
key. If rollback becomes necessary, suspend candidate workspace access/mutation
ingress and stop/drain incompatible workers, then prefer a forward fix. Turning
off autonomous delivery alone does not stop explicit delivery or UI writes.
Do not resume older writers until an isolated restored-copy check proves they
preserve candidate JSON, receipts and job state. No rollback drill was performed
in this audit.

## Fresh evidence and remaining findings

`npm run simulate:assistant -- --scripted` passed on October 18 with exit 0:
33 turns and zero reported state-check issues, including duplicate webhook,
malformed media and a second synthetic account check. Output is local
`qa/assistant-scripted-latest.json` / `.md`. This uses PGlite, scripted parser
decisions, fixture Calendar and captured transport. It proves neither current
live-model interpretation nor pg-boss/carrier/Google behavior. No paid allowance
was consumed.

Scoped source review covered candidate batch reminder cancellation, task
reopening, singleton nutrition target writes, meal/grocery reconciliation, and
provider/runtime boundaries. No new high-severity candidate code regression was
reproduced. This is not a full security audit. The isolation, mixed-version,
callback-routing and paid-worker hazards above are unresolved release blockers
until their concrete controls are established, not newly discovered candidate
application regressions. Browser wrong-number recovery, candidate connected
Calendar, actual SMS arrival and independent journey scores remain separate
acceptance gates owned by the parent release task. This documentation-only audit
did not rerun the full repository check; the historical frozen check is in the
checkpoint and must not be presented as a new October 18 run.
