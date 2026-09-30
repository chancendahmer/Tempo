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

Evaluator regression tests validate failure detection, not the model's ability
to understand these messages.

## Observed runs — September 29, 2026

Anthropic billing was restored. Both runs below used the real model, temporary
PGlite, captured SMS and the stateful calendar fixture described above. Production
database, messaging and Google credentials were removed from the test process.
All 25 exact replies in each run were manually reviewed. These are virtual weeks,
not evidence of a week of unattended production operation.

| Candidate | State checks | Human review |
| --- | --- | --- |
| `1a0599c` | 25 executed; 24 passed, one evaluator false positive | All intended changes occurred. The health check incorrectly rejected an honest unsupported-integration answer. Repetitive acknowledgments, long advice and an overconfident weekly summary reduced the isolated AI experience to 7.5/10. |
| `e11fde8` | 25 executed; 25 passed | Corrections became shorter and concrete. Recipe servings, meal dates, nutrition, routine time, reminder cancellation, task completion and confirmed calendar moves retained the right records. Cross-day recipe recall and the 4 PM calendar readback were correct. Isolated AI experience: 7.8/10. Remaining issues: occasional duplicate confirmations, suggesting a workout entry for steps, and omitting the current-plan/history limitation from the weekly synthesis. |

These scores are reviewer judgments, not measured accuracy or commercial-release
scores. Passing assertions did not erase the remaining response-quality defects.
The second account and ingress replay checks passed in both runs. They support
the tested isolation paths, not an unrestricted multi-tenant security guarantee.

### Real-account findings

A separate, user-controlled TextFree number was registered through the production
website. The initial START received no response. A scoped diagnostic found no
inbound message in Tempo and no shared-line contact route at Sendblue. The legacy
verification endpoint returned HTTP 200 with `status: ERROR`; the application had
incorrectly interpreted that as a sent verification message.

Creating the pending route using the documented `/v3/verified-contacts` endpoint,
then sending START again through TextFree, produced both Sendblue verification
and Tempo's welcome. The website recognized the connected phone. A demo profile
was saved successfully. No phone-verification flags were changed directly in the
database. The candidate signup fix automates this route creation, rejects malformed
or application-error success responses, and preserves an explicit dedicated-line
mode. A returned line that differs from the configured transport line fails closed.

The welcome assumed a visible contact-card attachment. TextFree showed only text;
asking naturally to skip the missing card produced a rigid DONE/help prompt. This
is a real onboarding defect, not an AI-simulation result. The candidate now offers
SKIP and recognizes ordinary requests to skip the optional contact step, without
claiming the contact was saved or bypassing consent. It still needs deployment and
real SMS retesting. Google authorization and the rest of the real account journey
remain separate release gates.

The next candidate also preserves concise health and rundown-history limitations
after model synthesis, including in compound requests. This guarantees the verified
notice is displayed; it does not structurally prevent contradictory generated prose.
That change needs another live review before raising the AI score.

### Wake & Wind Down browser checks

The candidate has manual sunrise and sunset sessions, 5–60 minute duration,
maximum visual-light control, a 20-second preview and synthesized waves/birds.
Desktop and 390px mobile controls were inspected. Sunrise brightened, sunset
darkened, sound selection/mute controls worked, completion and Escape worked,
and the final session dialog retained scroll position zero after an overflow fix.
Audio audibility on the user's hardware was not verified. Full-screen requests
gracefully reported the in-app browser's limitation.

This changes screen colors, not hardware brightness. Settings last for the current
visit. There is no scheduled wake alarm, closed-app guarantee, native light control
or verified installed-device audio behavior. It is not yet a replacement for a
dedicated alarm clock.
