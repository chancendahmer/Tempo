# Real demo account journey — September 30, 2026

These observations use a separate phone-verified production demo account and
its connected Google Calendar. The parent operated the browser; an independent
novice-user agent reviewed the exact replies and visible records. This is a
mediated review, not an agent independently operating the browser, twenty real
users, or a wall-clock week. No personal account was used for these writes.

## Iteration 1: observed production behavior

| Request | Actual result | Independent interaction rating |
| --- | --- | --- |
| Save a chickpea salad recipe with cucumber, lemon and olive oil | Saved recipe visible in Meal planner, two servings, ingredients and preparation | 9 |
| “Actually, make that serve two and add feta. Keep the rest.” | Same recipe updated with feta; other ingredients preserved | 9 |
| “I need to call the dentist tomorrow. Can you help me remember?” followed by “Just a task, no reminder time.” | Asked when to remind; then rejected the task clarification, no task created | 1 |
| Explicitly add dentist task for October 1 | Separate repair succeeded; upcoming task visible, dated October 1 at 11:59 PM | 8 |
| Make getting back into running without overdoing it a goal | Goal and description visible in Goals, no invented tasks | 9 |
| Where are saved items and what next? | Correct section names and grounded next step; literal Markdown visible in bubble | 8 |
| Create 15-minute demo planning event tomorrow at 3 PM | YES confirmation required; actual Google event read back October 1, 3:00–3:15 PM Eastern | 9.5 |
| Move that session to 4 PM, retain duration | YES required; same Google event read back 4:00–4:15 PM | 9.5 |
| Tomorrow and rest of this week rundown | Correct records, but incorrectly used Thursday–Wednesday instead of remaining calendar week | 6.5 |
| Add a Saturday 10-minute walk/jog toward running goal | Task created and visibly linked as goal's first step; exact task time not yet reviewed | Pending |
| Simple morning routine: water, teeth, dressed | Generic validation failure; clearer retry also failed, no routine created | 1 |
| Banana breakfast, leave unreliable nutrients unknown | Asked redundant nutrition choice; follow-up saved unknown values correctly in Food diary; acknowledgement typo | Pending |
| Save ordinary note about demo spare keys | Thought inbox contains requested text | Pending |
| Log 20-minute walk, then correct to 15 minutes | Movement card and total changed to 15 minutes on same date | Pending |

Independent provisional aggregate: **4.8/10 observed demo experience, 4.5/10
commercial readiness**. Core task-clarification and routine creation failures
keep the score below five despite strong individual successes. Explicit repairs
do not erase original failures. These scores are judgement, not measured metrics.

## Candidate repairs awaiting production replay

- Ground explicit task choices in the immediately linked reminder clarification,
  retaining subject and no-history-replay checks.
- Return one sanitized schema repair opportunity for malformed tool arguments;
  ask specifically for a missing routine start time, generate valid step IDs,
  keep strict schema validation and bounded execution.
- Honor explicit unknown-nutrition fallback without asking again; fix the
  unknown-protein acknowledgement.
- Bound remaining-week rundowns to the account's local Sunday.
- Render basic bold, lists, paragraphs and HTTPS links as escaped React text.
- Complete onboarding when Calendar was connected before coaching preferences.

`npm run check` passed: 363 tests across 61 files, lint, typecheck, production
build and operations build. Production replay is required to claim these live
failures are fixed.

## Iteration 2: deployed fixes and follow-up findings

PR 10 deployed successfully to both web and worker. Chat Markdown is formatted
in the dashboard. The original routine request now asks for its start time;
however, answering 7:30 AM still failed action grounding, and a fully specified
routine request still failed validation. These failures remain recorded.

A real TextFree request at 11:43 AM scheduled a two-minute stretch reminder,
and the matching message arrived at 11:45 AM Eastern. The dashboard nevertheless
showed failed. Scoped diagnostics found a failed outbound reservation caused by
Sendblue response `service` validation, followed by a duplicate retry. Candidate
repairs normalize optional service metadata without discarding the required
provider message handle, await duplicate reconciliation and prevent late errors
from overwriting successful reminder state. Existing ambiguous failed sends are
not blindly resent. Sendblue documents lowercase `sms` on fallback responses:
[sending messages](https://docs.sendblue.com/getting-started/sending-messages).

Candidate routine repair assigns new step UUIDs and initial completion state on
the server, retaining strict times, durations and existing-step edit validation.
Immediate routine-time answers are checked against the linked original request.

Observed foreground sunrise and sunset previews completed their 20-second
dark-to-gold and gold-to-dark transitions. This does not verify scheduled alarms
or audible sound. SMS recall correctly returned the recipe created and edited
on the dashboard, including feta, two servings and the same ingredients.

The full check passed 377 tests across 62 files, lint, typecheck and builds.
Subsequent food-search display-only rounding passed lint and typecheck; the final
production build also passed for that UI edit. Post-deployment replay is still required.

## Remaining release gates (current)

Reminder status consistency, proactive coaching delivery, worker recovery,
and the repaired novice journey remain unverified. Real scheduled SMS receipt
was observed as described above. Google OAuth is External
Testing with the demo account allowlisted; this is not public OAuth launch.
Wake & Wind Down is a foreground screen session; scheduled native alarms,
background reliability, hardware brightness and Health Connect remain unsupported.
Account-isolation suites are automated checks, not twenty-person load validation.

## Iteration 3: live replay after PR 11

Both Railway services ran PR 11. A fully specified Easy start routine saved at 07:30 with Drink water, Brush my teeth, Get dressed in order. Starting its first step opened a fullscreen countdown; Done persisted 1 of 3 steps. The short answer '7:30 AM works' still failed grounding and remains a failed regression until replayed after the next fix.

A fresh SMS two-minute reminder arrived in TextFree at 12:25 PM. The dashboard showed sent, and a scoped read confirmed a persisted provider handle, sent timestamp and no last error. The earlier ambiguous failed reservation was not resent.

Typed barcode 5449000000996 returned Coca-Cola Original through Open Food Facts. Camera capture remains untested. Dentist completion was acknowledged and Today counted one completed task.

A weekly rundown submitted during rollout became stranded processing. A candidate recovery fix retries busy claims instead of acknowledging them, extends the queue execution budget and updates existing queue settings. Recovery may take about 10–11 minutes; old queued jobs retain their original budget and already stranded actions need scoped recovery. This is a release failure, not a successful agenda test.

The next candidate passed npm run check: 384 tests across 62 files, lint, typecheck and production/operations builds. Its natural-time and restart fixes still require live replay.
