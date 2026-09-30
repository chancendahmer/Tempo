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

Fresh reminder status consistency and proactive coaching delivery were observed
in later iterations below. Automatic restart recovery and the complete repaired
novice journey still require live verification. Google OAuth is External
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

## Iteration 4: live PR 12 regressions

The original dentist clarification now creates an untimed task, verified in Upcoming. A natural evening-routine request followed by '10:30 PM works' saved Evening wind-down at 22:30 with the three requested steps in order. Navigation help named the actual sidebar sections. Independent mediated review provisionally rated the current demo 7.2/10 and commercial readiness 6.4/10.

The stranded read-only weekly request was recovered by an account/message/action-guarded transaction using the original queue job ID and public retry. Failed preparation attempts rolled back; no new inbound message or task was created by recovery. Its eventual reply covered through Sunday, but incorrectly annotated a current open dentist task using an earlier completed task with the same title. Current-lookup authority is strengthened in the next candidate; fresh rundown replay remains required.

Before canary configuration, the assistant correctly disclosed that automatic task monitoring/outreach was not enabled. A new account-scoped proactive canary is being tested; it does not establish observed live proactive delivery yet.

## Next candidate: ordinary task wording and controlled coaching

A natural laundry request was incorrectly consumed by a shortcut parser, losing its deadline and duration. A follow-up update stored 20:45 local instead of requested 16:45; a scoped read confirmed this was persisted incorrectly, not only displayed wrong. Candidate fixes defer unsupported scheduling and compound task language to the model, then canonicalize unambiguous today/tomorrow AM/PM deadlines in the account timezone. New persistence tests deliberately supply the wrong model timestamp.

Date-only end-of-day task labels now display By end of day in Tasks, Today and Calendar task rows; explicit other times remain shown in the account timezone. Morning requests without a clock ask for one, and immediate linked time answers remain grounded against the original task.

A 20-account PGlite integration test concurrently commits distinct tasks and checks account-specific model input, web replies, workspace records and weekly rundowns. It uses a scripted parser and captured transport; this establishes isolated code-path behavior, not production load or twenty real phone/Google accounts.

PROACTIVE_CANARY_USER_IDS defaults empty and restricts controlled delivery to configured account UUIDs. Evaluation, delivery, capability replies and queued follow-ups use the same operator permission. Opt-in, consent, quiet hours, calendar availability, cooldown and caps remain enforced. No live canary setting or proactive receipt has been verified yet.

The complete next-candidate check passed 425 tests across 66 files, lint, typecheck and production/operations builds. A live recipe edit changed servings from two to four while preserving all six ingredient lines and five preparation instructions in the Meal planner readback.

## Iteration 5: live PR 13 and conversation interruptions

Both services deployed PR 13. Fresh live edits displayed Fold demo laundry at 4:45 PM and Put out demo recycling at 5:00 PM with the requested durations. A fresh weekly rundown covered through Sunday, included the connected Google Calendar event at 4 PM and the running goal, and correctly described the current dentist task as open without borrowing an older completed task's status.

The separate demo account was configured as the sole proactive canary and explicitly opted into at most one daily check-in. A real coaching message arrived in TextFree and the dashboard. Replying “I will get started right now!” acknowledged the commitment and automatically opened the fullscreen laundry timer. This is observed live outreach and UI follow-through, not simulated transport.

The coaching message arrived between a Sunday task's time question and “9 AM works”; that answer failed grounding. The next candidate resolves the latest human request and its linked clarification despite unrelated outbound coaching. A separate deterministic gate suppresses initial proactive evaluation and delivery within five minutes of an inbound web or SMS message. Human topic changes still invalidate old clarification context. Exact deployed replay remains required; no readiness score above the core-action failure threshold is claimed yet.

The first candidate-wide check passed lint and typecheck but failed one of 431 tests: the provider-free journey used real database inbound timestamps with an earlier fixed evaluation clock. The fixture is being corrected to use its simulated clock. This failure is recorded rather than reported as a passing release check.

Additional live novice requests found incomplete meal ingredients and a three-item grocery request that saved only its first item. Candidate repairs add account-owned recipe ingredient copying, optional meal servings shown and editable in the UI, and a bounded atomic grocery batch. Tests cover foreign recipe denial, full ingredient preservation, serving validation, batch replay without duplicates, account isolation and rejecting unrequested grocery items. Deployed replay remains pending.

The final combined candidate passed npm run check: 434 tests across 66 files, lint, typecheck, Next production build and operations build. An intermediate operations build caught newer Array APIs unsupported by the worker compiler target; the clarification resolver now uses compatible array operations. Completing the live laundry focus session removed that task from Today, leaving recycling as the only current task.
