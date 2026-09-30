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

## Remaining release gates

Real scheduled SMS reminder receipt, proactive coaching delivery, worker recovery,
and the repaired novice journey remain unverified. Google OAuth is External
Testing with the demo account allowlisted; this is not public OAuth launch.
Wake & Wind Down is a foreground screen session; scheduled native alarms,
background reliability, hardware brightness and Health Connect remain unsupported.
Account-isolation suites are automated checks, not twenty-person load validation.
