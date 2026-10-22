# Tempo private-pilot delivery plan

Owner: principal engineer/product lead. Updated October 22, 2026.
Status: implementation and validation in progress; **not a launch approval**.

## The decision

Build a dependable daily loop before expanding the feature catalogue:
**capture something → see it in the same account → choose a manageable next step →
do or adjust it → receive appropriate support → return tomorrow.** Food, movement,
notes and routines belong to this shared workspace; they should not become separate
apps users have to reconcile.

Keep the approved adaptive Home: pill navigation, contextual activity banner,
visible To-do and today's Calendar, direct focus timers, restrained imagery and an
optional journey. Preserve the identities of the existing Nutrition, Fitness and
other spaces. Only change UI to resolve an observed usability or functional defect.

The founder's broader vision includes Tempo's own assistant plus authorized
external-agent connectors. For this pilot, Tempo itself must work without those
connectors. Hardware, wearable-derived wellness intelligence, native background
alarms, unrestricted autonomous execution and external-agent partnerships are not
pilot dependencies or claims. Do not spend this sprint building them.

## What must be true for the first ten people

1. **Private, understandable activation.** An invitation gate covers both web and
   inbound SMS. A user can correct their phone, verify, see their identity, set
   local time/quiet preferences, sign out and return. Existing customers and STOP
   remain protected. An invitation is not SMS or proactive consent.
2. **One account across SMS and UI.** Every supported mutation is owner-scoped,
   durable, retry-safe, visible after reload and retrievable through the other
   channel. A truthful failed/partial response is preferable to false success.
3. **Useful connected workflows.** Thought → task preserves the thought and does
   not duplicate tasks. Task → timer → completion works. Routines follow local
   days. Meal → servings → groceries is predictable and does not imply food eaten.
   Nutrition totals and workout history remain real, editable account records.
4. **A support and learning loop.** Users can report a problem or suggestion with
   section, impact and optional detail. No message history is silently attached.
   Founder can review issues and contact only users who authorize follow-up.
5. **A safe operating envelope.** The operator can identify the deployed web and
   worker version, effective sending settings, queue trouble, costs and recovery
   status. Alerts actually reach an owner. Backup restoration and rollback are
   demonstrated. Provider capacity and consent flows are verified separately.
6. **Honest customer quality.** Every exposed essential workflow is usable; broken
   optional features are repaired or explicitly unavailable. Customer and UI
   reviewers score each relevant section and the full journey at least 8/10 from
   observed behavior, with no critical/high authorization, consent, data-loss or
   delivery defects. Ratings do not override failed release gates.

## Team and file ownership

Use Sol 6.1 for bounded execution and review. Use Astra medium or the principal
agent for integration/architecture when needed. Do not change models just to
obtain a more favorable review. Limit concurrent editors and give each a clear
file boundary; only the integration owner changes shared migration metadata.

| Package | Owner | Concrete work | Completion evidence |
| --- | --- | --- | --- |
| A1 — Admission | Activation engineer | Opt-in invite gate before provider side effects; preserve STOP and grandfather verified accounts; accurate Calendar privacy copy | Web and repository tests, denied/invited/legacy/STOP cases |
| W1 — Connected records | Workflow engineer | Atomic thought/task backlink and duplicate prevention; workout plan relationship integrity; small explanatory copy repairs | Shared-channel, ownership, retry and lifecycle regressions |
| R1 — Queue envelope | Reliability engineer | Bounded isolated 20/100-account pg-boss drill; explicit intervention model deadlines | Real PostgreSQL harness report, captured transport, no live-capacity claim |
| A2 — Activation and feedback | Activation engineer — implemented | Web timezone confirmation plus a short persistent feedback/report-problem flow; operator retrieval | Repository/API tests and authenticated phone/desktop observations; broader accessibility checks pending |
| R2 — Operator visibility | Reliability engineer — implemented | Worker build/effective-policy attestation and a read-only pilot operations report | Sanitized report, wrong/missing/stale worker config cases, recovery instructions; hosted verification pending |
| C1 — Cost boundary | Implemented and locally validated; rollout gated | All five AI adapters use durable reservations, pinned pricing, caps and uncertain-debt accounting | Real PG races and independent review pass; caps, retention, deployment attestation and live canary remain |
| W2 — Reminder clarity | Implemented; full novice weeks pending | Saved cadence/timezone and terminal history; explain task time/completion versus requested texts | Bounded seven-day and fresh HTTP checks pass; current browser evidence unavailable |
| Q1 — Independent review | A different engineer | Review other authors' changes, novice journeys, mobile/keyboard, abuse/failure paths | Reproducible findings and evidence; no score laundering |
| L1 — Real integration/release | Principal + operator | Candidate real-account SMS, Google, migration/rollback, deployment and post-release canary | Provider handles and sanitized state evidence, compatible web/worker commit |

Keep packages small enough to commit independently. Do not create a second job
system, replace PostgreSQL, or rewrite the assistant to solve a localized defect.

## Current baseline and newly found gaps

The adaptive branch began this sprint at `d7e1a0e` (documentation) over `864fecb`
(code). The previous pass recorded 878 passing tests, 3 skipped, lint/typecheck and
production build; isolated 20-account concurrency and recovery fixtures; customer
8/10 and designer 8.4/10. See `qa/adaptive-followthrough/README.md`. These are
historical results, not current release certification or live provider evidence.

Fresh audits in `qa/pilot-2026-10-22/` identified:

- Public signup and unknown inbound START had no private-cohort boundary.
- An account's saved thought could be converted repeatedly without a durable link.
- Workout logs accepted newly assigned missing/foreign/non-plan identifiers.
- Intervention model defaults could outlast the job's useful deadline.
- Worker heartbeats did not attest the worker's actual sending policy/build.
- No durable aggregate production model-cost ledger was found. QA cost files are
  not production spend controls.
- Product feedback and web timezone confirmation lacked a complete customer flow;
  A2 now implements both with local persistence and browser evidence.
- Hosted backups/restore, alert delivery, commercial provider capacity and final
  real-channel canaries remain unverified for this candidate.

The A1/W1/R1 and A2/R2 passes have implemented the admission, connected-record,
queue, feedback, timezone and operator-visibility packages. Independent review
found and closed a STOP/pause bypass, stale-worker false-safe verdict, heartbeat
retirement race, migration constraint-name mismatch and small UI issues.
The customer review for the new flows is 9/10; the designer review is 7.5/10
pending additional interaction/accessibility evidence. These bounded scores are
not whole-product certification. Refer to the handoff and current result files.

## Cohort gates — ten, then twenty-five, then one hundred

These are proposed operating rules for this pilot, not industry benchmarks or
claims of observed retention. The founder decides whom to invite; agents never
send unsolicited customer outreach.

### Gate 0: candidate is safe to invite

- Normal `npm run check` passes and all required isolated PG checks pass.
- No unresolved critical/high defect in an exposed essential flow.
- Independent customer/UI and code reviews are current and findings are resolved.
- Admission configured deliberately on **both web and worker**; configuration
  defaults do not by themselves enable the pilot. Max 100 invite entries is an
  allowlist bound, not a total existing-account cap or provider capacity promise.
- One real dedicated demo account completes signup, same-account UI/SMS edit,
  Google read and confirmed write, reminder delivery, and STOP/START checks.
- Actual provider capacity, billing controls, deployment compatibility, safe-send
  switches, alert owner, backup restore and rollback are documented.
- Feedback route and timezone/quiet-hours setup are usable.

### First ten: guided private beta

Invite ten adults who experience executive-function friction, using intentional
manual onboarding. They may use routine/task support without sharing a diagnosis.
Offer sample records only by choice. Label sample data and keep it out of metrics.

Observe at least seven days and collect structured feedback before expansion.
Daily: triage failed actions/delivery, stuck jobs, spend and customer confusion.
Record denominators: invited, verified, activated (first durable useful action),
returned on another day, completed/adjusted a task, and unresolved support cases.
Measure usefulness and trust through explicit questions; a streak is not proof
of clinical benefit, retention or consent.

### Twenty-five: prove repeatability

Expand only with no open critical/high defects, at least 48 hours of stable
operations after the most recent release, known per-active-user cost, and a
manageable support load. Record founder go/no-go; do not automatically expand.
Use a mixture of new empty accounts and continuing users, realistic meal/workout
workflows, local-day boundaries, and mobile use. Review feedback and costs again
over at least a week.

### Toward one hundred: prove the whole service envelope

Require the isolated 100-account correctness drill plus an approved representative
hosted/provider test, connection-budget review, actual provider throughput/contact
limits, Google access eligibility, enforceable spend bounds and recovery evidence.
The isolated harness is not an SMS carrier test, real-model latency measurement,
production capacity forecast or substitute for a restore drill.

Before increasing invitations, agree a pilot operating budget. The existing $10
authorization covers paid **testing**, not a new monthly operating commitment.
Do not purchase staging, increase limits or change subscriptions without explicit
authorization. If access or paid infrastructure blocks a gate, keep the candidate
intact and report that specific blocker while completing independent work.

## Evidence and acceptance matrix

| Flow | Minimum observation |
| --- | --- |
| Account/setup | Wrong number recovery, invite rejection, verified legacy user, isolated new user, timezone, logout/re-login |
| Home/tasks/focus | Correct local day and banner, manual category/duration survives AI suggestion, start/pause/reload/complete, undo/reopen |
| Thoughts/goals/memory | Full thought preserved on conversion, task reuse on retry, goal steps persist, deleted memory not retrieved |
| Calendar/reminders | Real connected read, separate confirmation for write, corrected dates, multiple reminders, actual delivered demo reminder |
| Routines/journey | Local-day progress, navigation/reload, gentle reset, optional streak display, reduced motion |
| Meals/groceries/pantry | Serving changes, source reconciliation, incompatible units, retries, manual lines preserved, purchase vs pantry/eaten distinction |
| Nutrition | Units/servings/arithmetic, dates/history, custom food, provider failure and barcode fallback |
| Fitness | Own saved plan, editable template, scheduled task vs logged workout distinction, foreign link rejection, historical log after plan deletion |
| Assistant | Advice/negation no-write, short clarification after interruption, idempotent multi-action, fresh cross-channel retrieval, honest partial failure |
| Platform | Conflicting multi-account records, concurrent operations, queue failure/recovery, no resend of ambiguous delivery, effective worker policy |

Every report records commit/environment, exact actions, observed state, remaining
limits and evidence type. Keep local fixtures, scripted conversations, real model
calls, actual Google operations, browser checks and carrier deliveries separate.
Do not use another agent's claimed score as independent persistence proof.

## Economics and measures to instrument

Measure per active account: model tokens/calls and billed/estimated cost, search
cost, SMS accepted/delivered/failure counts, fixed provider charges allocation,
hosting cost allocation, support time and useful repeat workflows. Store no raw
prompts, phone numbers, health logs or private message text in an analytics feed.
Reconcile estimates with provider invoices. Unknown cost stays unknown.

Cost policy must bound ordinary heavy usage and retries, not only malicious load.
Reserve budget atomically before calls where possible, reconcile usage afterward,
expire failed reservations carefully, and cover all model call sites. Never gate
STOP, privacy controls or cancellation behind a spend cap. If the full ledger is
not implemented, explicitly restrict cohort/spend with verified provider controls
and operator oversight; do not claim software-enforced aggregate protection.

## Checkpoint discipline

Checkpoint after each integrated package: tests, current commit, changed files,
remaining defects, last sanitized live/provider result, central API ledger and
next exact commands. Check usage at milestones. Begin a handoff before the user's
15% remaining threshold; tool meters may show a different account/window than the
user's UI. Do not merge to avoid losing work. Preserve the original dirty checkout.
