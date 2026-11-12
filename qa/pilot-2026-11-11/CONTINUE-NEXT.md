# Tempo continuation after the November 11 release

Read AGENTS.md, this file, HOSTED-CONTINUATION.md and the relevant local Next.js
guide before editing. Verify Git and deployment state rather than assuming this
checkpoint is current. Preserve unrelated original-checkout changes and output/.

## Released baseline

PR #29 released contextual task timing, delivery safeguards and a mascot-led
tour. PR #30 released current-task priority, bounded server ordering, timezone
corrections and clearer save/focus feedback. PR #31 repaired explicit requests
being consumed as short check-in feedback. Both roles run production merge
`cf7b62b6ce8c262982e8191e85e0eeacf4b27362`; readiness was clean at 22:35 UTC.

The final code passed npm run check with 179 files / 1,458 tests, lint,
typecheck, Next.js production build and operations build. Isolated PostgreSQL
integration and recovery tests were enabled. Home and the guide each received
9/10 in independent desktop/phone preview review. Those are scoped scores;
the entire product and hosted proactive delivery do not inherit them.

Use HOSTED-CONTINUATION.md for final provider observations, cleanup and spending.
One automatic check-in arrived in TextFree. The test task is abandoned and gone
from Home; a final read-only text returned the same three task names as the UI.
The local branch codex/proactive-reply-routing contains post-merge evidence commits;
do not redeploy documentation alone. Start the next code branch from verified main.

## Highest-priority work

**Released repair requiring a future hosted replay:** a pending proactive check-in
consumed an explicit task deletion as negative feedback because `no` matched
inside `no longer needed`. The first request did not mutate the task. The second
request, after pending feedback cleared, correctly removed only that task and
updated the open dashboard. Cleanup is complete. The branch
`codex/proactive-reply-routing` contains the narrow whole-reply grammar fix and
isolated pending-check-in regression work. PR #31 merged as `cf7b62b` after
179 files / 1,458 tests, lint, typecheck and production/operations builds passed.
HOSTED-CONTINUATION.md records the verified deployment. A hosted pending-check-in
replay of the repair remains
open; do not reset the demo's daily cap to manufacture it.

1. Diagnose invalid intervention-review output. Three of five classified reviews
   through 21:55 UTC were invalid; two were valid vetoes. Numeric usage did not
   establish token truncation. Add a small structured diagnostic with allowlisted
   stop reason, tool count, expected-tool match, schema-failure category and token
   counts. Never log response content, tool arguments, prompts or private account
   data. Preserve fail-closed behavior. Establish the actual cause before changing
   the contract or increasing output limits. Test malformed/duplicate/overlong
   responses and correct responses without live charges first.
2. Distinguish planned task time from true expiry in typed review context. The
   21:55 review incorrectly treated a 25-minute-late ordinary to-do as potentially
   moot. Do not simply remove all stale-content checks. Cover a recently late
   actionable task, a genuinely expired event, and an old task with no current
   context. See NEXT-PROACTIVE-SLICE.md.
3. Separate transient blocked observations from paid-review reservation identity.
   A recent-activity hold at 22:00 occupied the task's 15-minute slot and prevented
   a review at 22:05. Retain one paid attempt/holdout decision and at most one
   provider submission per opportunity under retries and concurrency. Do not
   create an expensive polling loop or reset live reservations to force delivery.
4. After those reliability fixes, implement one independently eligible, explicitly
   selected routine check-in, including an account with zero tasks. The current
   cross-app signals influence task check-ins; meals, workouts and routines cannot
   independently originate every advertised outreach type. The design note covers
   typed targets, consent, occurrence identity, late-change checks and recovery.

Use an implementation agent plus an independent reviewer with separate file
ownership. Keep paid testing centrally accounted. Run nearest tests while editing,
lint/typecheck, and the full release check before any merge. A review score never
overrides ownership, persistence, delivery or consent failures.

## Access, spending and safety

- Dedicated demo phone ends 8736; Google demo account is
  chancendahmer@axionsystems.us. TextFree and Tempo sessions were authenticated.
  Ask the user to reauthenticate only if a current observation proves expiry;
  never request codes, passwords or API keys in chat.
- Existing test-run cap is $20, not a fresh allowance on resume. Retain unresolved
  historical, carrier and hosted holds and reread the ledger before new paid calls.
  Latest known settled total is $4.747070, of which this continuation added
  $0.297822 across 13 settled calls. This is not a full bill or released headroom.
  The separate ongoing pilot allowance is $10 total per UTC day, enforced across
  accounts. Do not increase budgets, subscriptions or infrastructure spending.
- Live optional outreach is limited to the single dedicated demo canary. Both
  roles retain global shadow mode on, autonomous sending off and cleanup off;
  the canary enables both task coaching and old-item cleanup subject to account
  consent and normal gates. Do not opt in other customers or widen the canary.
- Preserve personal records and old demo items. Clean only the exact fictional
  records created for a named test. Never reset uncertain outbound attempts.
- Never read populated secret files. Use normal runtime credential loading and
  sanitized connectivity checks. Local env and Railway env are separate.
- Production web/worker must match. Verify platform removal before archiving
  exact stale heartbeat evidence with the guarded manifest procedure. Rollback
  reference for this release is 943d560 on both roles, preserving PostgreSQL.

## Remaining product limits

See CHECKPOINT.md for the capability list: web and SMS onboarding remain separate;
hardware/background alarms, wearables, MyFitnessPal import, broader Calendar
scope, paid billing and automatic weekly recap are not finished. Physical-camera
and assistive-technology validation, a hosted customer week, retention/PITR and
external operational alerts remain. Synthetic multi-account tests do not prove
10–100-person production capacity. Revalidate the pricing snapshot before
November 22 and migrate legacy Railway configuration before December 1.

## Short customer or investor walkthrough

1. Open the real dedicated demo account and point out its visible identity. Use
   the fictional preview only when explicitly labeled as a resettable design demo.
2. Add one clearly named demonstration task for today. Reload and show that Home,
   To-do and the Calendar day agenda agree about its title and planned time.
3. Start its short Focus timer, pause, return Home and continue the same session.
   Explain that finishing a timer and completing a task are separate actions.
4. Replay Show me around to demonstrate the mascot, highlighted controls, Skip
   and keyboard-friendly navigation. Show the independent check-in preference,
   quiet hours and connected Google Calendar status in Settings.
5. If showing texting, use only the controlled demo number. Verify both the reply
   and the resulting saved dashboard state. Do not present an unsent AI decision
   or a scripted transcript as automatic SMS delivery. Remove only the records
   created for this demonstration afterward.
