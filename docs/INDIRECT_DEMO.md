# Indirect week evaluation

Run `npx tsx scripts/simulate-week.ts --indirect` with the model credentials
already configured in the process environment. This is a 25-turn synthetic
week, alternating SMS and web ingestion, using ordinary phrasing, pronoun
corrections, cross-day recall, questions, and an intentionally ambiguous delete.
`--indirect --scripted` is rejected: there are no canned answers for this suite.
Reports are `qa/week-indirect-live-latest.md` and `.json`.

Assertions check both requested changes and preservation of unrelated records.
Corrections must keep the original identity and advance the item version.
Missing prerequisites fail; deleting nothing does not count as success.
Advice, navigation, health questions, recall and overview requests must not
modify product state. Unrequested memory/reminder writes also fail, including
reminders outside the current dashboard date window. Every ingress is replayed
to check that it neither responds again nor repeats a calendar write. A second
synthetic account has a private marker and must remain unchanged.

The calendar is an account-owned, stateful fixture. Confirmed changes update
its events, and agenda reads filter by overlap with the requested range. The
weekly overview must recall the rescheduled dentist at 4 PM rather than 2 PM.
This checks simulated read-after-write, not Google's actual behavior. SMS is captured;
the database is temporary PGlite; HTTP authentication, rendered UI, scheduled
worker delivery, production persistence and real integrations are not evaluated.
Day labels advance a virtual clock, not a wall-clock week. API/search charges
apply to live calls. A permanent billing/configuration response stops later
turns and labels them not run rather than passing them.

## Human review and release scoring

Do not turn the pass percentage into a commercial-readiness score. Inspect
every exact response for appropriate interpretation, excessive clarification,
unearned claims of success, empathy, concise useful guidance and consistency
with the actual saved records. Loose reply-content checks are triage signals,
not proof of response quality. Record each failure and the iteration that fixed
it; repeat the affected conversation and then the full journey.

Use a 10-point rubric: correct actions 3.5; contextual understanding 2.5;
usable and understandable UI 2; real integrations 1; operational reliability 1.
An account leak, unsafe unconfirmed action or broken core action keeps the
score below 5 until fixed. A passing model journey alone can support an AI
subscore, but cannot certify the overall product at 8 or above. An 8+ commercial
rating also needs observed production-account phone/OAuth and dashboard updates,
real calendar read-after-write, installed-device alarm/audio checks, and worker
recovery evidence. State untested features and blocked runs explicitly.

This suite has no observed live score until a configured run and human review
have completed. The four evaluator regression tests validate failure detection,
not the model's ability to understand these messages.
