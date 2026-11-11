# Contextual check-ins and guided onboarding

November 11, 2026. Worktree: `tempo-adaptive-home/Agentic AI Assistant SMS`.
Branch: `codex/contextual-checkins-onboarding`. Production reference before this
work is `2ca6fc0b1938fd01b9a9a7f82d7feb6e6577b79a`.

## Scope and design

Tempo's existing durable five-minute evaluator now combines task urgency and
calendar fit with saved cross-workspace signals. A current Focus session blocks
optional contact, including the countdown started by SMS. Upcoming routines and
recent workspace activity lower interruption priority; recent Thoughts explicitly
linked to a task modestly raise its relevance. These are engineering heuristics,
not clinically validated predictions about a person's health or attention.

The deterministic consent, quiet-hours, Calendar freshness/busy, cooldown, daily
cap and pending-response gates precede AI review. The review can veto only. One
reservation owns a review opportunity; final task state and eligibility are
rechecked immediately before submission. Failed, malformed, truncated and refused
AI reviews skip optional contact. Uncertain provider submissions stay in
reconciliation; they are not blindly replayed.

The guided tour highlights actual controls for Spaces, the current activity,
task timer, capture, Ask Tempo, Connections and check-ins. Preview adds a signup
step and explicitly labels fictional data. Skip, replay, reduced motion, focus
restoration and resuming a first-time setup draft are supported. No tour step
opts a person in or writes sample account records.

Settings now show delivery availability separately from the saved opt-in and
support editable overnight quiet hours with stale-write protection. Re-enabling
after an assistant opt-out restores one daily check-in if the old cap is zero.
Positive limits and SMS consent are preserved. Display names are optional.
Public marketing describes invitation-only access, optional check-in conditions
and proposed, unavailable paid tiers rather than a functioning checkout.

## Evidence and current release state

- Focused backend, adapter, HTTP ownership, persistence and tour suites pass.
  See [independent audit](customer-capability-audit.md) for exact runs and scope.
- The tour author exercised all steps at 320×568 and 390×844 using a local
  browser fixture, including empty task state and preserved setup drafts. The
  independent reviewer inspected those captures. These were not physical phones.
- The lead traversed all eight desktop preview steps and verified returning focus
  and section. Native time controls saved 21:30–07:30 in the fictional preview.
  [Preview quiet hours](quiet-hours-preview.png).
- The first full `npm run check` passed lint, typecheck, 1,417 tests in 179 files,
  and both production/operations builds. Local PostgreSQL concurrency, recovery,
  receipts and retirement suites were enabled. A final full run is in progress
  after the cleanup race fix (`340ad7b`); ignored logs retain both runs.
- The lead used normal one-time sign-in confirmation to enter the persisted,
  fictional QA Rowan account on local PostgreSQL. Quiet hours 21:45–07:15 saved
  and survived reload. Opt-in correctly reported pilot sending paused and was
  restored to off. All seven signed-in tour steps completed and restored Settings
  with focus on Show me around. [Authenticated reload](quiet-hours-authenticated-reload.png)
  and [last tour step](tour-authenticated-checkins.png). This development runtime
  has no provider credentials or worker; it is not evidence of hosted delivery.
- Production health and readiness were green before changes, with one matching
  worker and no pending ambiguous outbound messages. Existing acknowledged
  historical records remain intact. Optional outreach was still off, shadow on,
  and the canary list empty.
- The signed-in dedicated demo account is verified, active, opted in, SMS setup
  complete, cap one per day, quiet 23:00–07:00 New York, and connected to a fresh
  Google Calendar. No consent was changed by this run.
- No new paid model request or provider message has been made in this work yet.
- Independent local scores after that walkthrough: guide 9.0, Settings 9.5,
  contextual engine 8.5; mean 9.0. Hosted behavior remains unscored.

## Remaining advertised gaps

1. The proactive pipeline still needs an actionable task. It cannot independently
   originate every kind of meal, workout, nutrition or general wellness check-in.
   Cross-app signals help timing and relevance; they do not prove food was eaten,
   a workout happened or a health condition changed.
2. Web welcome and SMS onboarding remain separate. Settings explain outstanding
   text setup and Calendar prerequisites; they do not silently complete them.
3. Hardware, dependable background wake/brightness, wearable health monitoring,
   MyFitnessPal account import and physical-phone camera scanning are not verified
   released capabilities. The existing foreground wake UI is a separate feature.
4. Primary Google Calendar is the supported Calendar integration. Shared/recurring
   event management and multiple Calendar providers are not complete features.
5. Paid checkout, paid tier enforcement and automatic weekly recap delivery are
   not available. The public pricing page now marks proposals accordingly.
6. A hosted attended customer week, assistive-technology testing, scheduled backup
   retention/PITR and automatic external operational alerts remain work before
   broad expansion. Synthetic multi-account tests are not hosted capacity proof.

## Release and rollback

Do not merge or enable outreach until the final cleanup submission guard,
independent review and full release checks pass. This change adds no migration.
Web and worker must deploy a matching commit. Verify a single dedicated opted-in
demo canary before expanding delivery permission; do not create customer consent.
Keep the approved aggregate AI operating limit at $10 per UTC day.

Rollback both roles to the compatible production reference above, preserving
PostgreSQL records. For immediate outreach containment, clear canaries, keep
shadow mode on, and turn autonomous/cleanup sending off on both roles and restart.
Check actual platform inventory and fresh worker attestations; stale heartbeats
alone do not prove an instance stopped. Never reset ambiguous sends to retry.

## Spending continuity

The prior $20 test authorization retains $16.902717 in conservative commitments,
including a $3.021 unresolved historical call, $1 carrier hold and $9 hosted hold.
Previously known test usage was $4.449248. Do not erase holds to create headroom.
The $10/day pilot operating authorization is separate. The current pricing
snapshot expires November 22 at 00:00 UTC and needs revalidation before then.
The runtime report before this change observed matching enforced settings on
one web and one worker: $10 global/day, $10 account/day (the global cap is shared),
100 global/60 account calls. November 11 settlement was $0.039396 across two calls
with no outstanding attempts. The report's inventory caveat is retained; the
platform must separately confirm there are no other active deployments.
