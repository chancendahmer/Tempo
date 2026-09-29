# Tempo demo evaluation — September 29, 2026

This is an evidence log, not a release approval. One person must have one account
shared by dashboard and messages. Twenty testers must have twenty isolated accounts,
not one shared login. No real tester accounts were created in this run.

## Scoring

The requested scale applies to the functioning product: below 5 is not ready to
demonstrate reliably; 6–8 requires working live AI with remaining experience gaps;
above 8 requires only minor changes. Unknown critical capabilities cannot earn a
passing score. These scores describe demo readiness, not measured model accuracy.

| Iteration | Readiness | Evidence and remaining gaps |
| --- | --- | --- |
| 1: initial execution | 4/10 | Live assistant invocation stopped before a call: no process model/key. Dashboard refresh used a 15-second interval. A new context regression showed web replies lacked reply-to relationships. No configured persistent demo database. |
| 2: mixed-channel fixes | 4/10 | 14 scripted journey turns pass, including actual repository snapshots; 20-account context isolation passes; reply relationships now persist and enter model context. Pending-message polling is faster and stale editor feedback is cleared. Live model, authenticated browser/database/worker integration and proactive delivery are still unverified, so the overall score remains capped. |

Live AI personality, natural-language accuracy, ambiguity handling, latency, and
multi-turn recovery remain **unrated**, not passed. Synthetic model fixtures cannot
establish those qualities. No claim of 20-user production capacity is made.

Final validation: `npm run check` passed lint, typecheck, 261 tests across 50
files, the Next.js production build, and operations compilation. `git diff
--check` reported no whitespace errors. The targeted reply-link regression
failed before the fix and passed afterward.

## Executed user journeys

`npm run simulate:workspace -- --scripted` creates one isolated synthetic account,
alternates SMS and web messages, and saves exact replies, tool calls, and full
dashboard repository snapshots before and after every turn. A second empty account
is checked after each turn. The 14 steps cover:

- Save a recipe; change its servings by referring to the prior recipe.
- Plan dinner without logging consumption; move that meal to another day.
- Log food while preserving unknown nutrients as null.
- Save a morning routine, workout, grocery item, and note; delete the note.
- Create and complete a task; create a long-term goal; recall recipes.

Artifacts: `qa/workspace-scripted-latest.md` and `.json`.
The existing 33-turn assistant simulation also passed its scripted state checks.
Both use temporary PGlite, not a running PostgreSQL server or production data.
They capture SMS rather than sending it, and invoke processing directly rather
than running pg-boss. Calendar behavior remains a fixture.

The new account-journey integration tests check 20 concurrent synthetic accounts,
account-specific model input/history/memory, dashboard-only notes visible through
the assistant, mixed-channel conversation continuity, no extra SMS for web replies,
replayed web requests, manual edits followed by assistant readback, and rejection
of another account's deletion request. Each send constructs a fresh orchestrator;
the context comes from repositories rather than a shared in-memory chat buffer.
This does not test survival of a database/server restart.

## Implemented changes

- Web replies and their reply-to relationship are written transactionally and
  deduplicated. Regression reproduced missing relationship before the fix.
- Model history includes message IDs and reply-to IDs. Existing current-turn
  authorization and account-specific tool execution remain in place.
- The simulation now supports the actual web workspace ingress and web reply
  sender, in addition to the Sendblue parsing/persistence path.
- Dashboard polls about every two seconds for up to two minutes while recent
  messages are pending, then falls back to the normal interval. Polls do not
  overlap each other. This is polling, not instant push delivery.
- After 30 seconds, pending messages explain that they are saved and delayed.
- Navigation and life-item editors clear stale feedback. Singular task/serving
  labels are corrected.

## Browser observations

Reviewed the rendered local `/workspace/preview` dashboard. Started a task, paused
its full-screen timer, and completed it; the dashboard advanced to the next task
and updated the completion count. Created a Lemon rice recipe and verified its
card. Reopened the editor after the fix and verified old success feedback was gone.
An attempted recipe-to-dinner click did not produce a verified state change through
the browser control; this interaction remains open for retest.

Preview is explicitly labeled sample data and resets on reload. These browser
observations are separate from the database-backed scripted journey, not evidence
that a live AI action reached a rendered authenticated dashboard. Faster polling
and delayed-worker messaging still need a configured worker/browser canary.

## Next live iteration

Configure ANTHROPIC_API_KEY and ANTHROPIC_MODEL in the process environment, without
pasting secrets into chat. Then run `npm run simulate:workspace` and
`npm run simulate:assistant`. These send synthetic prompts to the real model and
incur API charges. Workspace scenarios inject January 14, 2027 as the clock for
repeatability. Review live transcripts manually; state assertions alone do not
grade a conversational response or prove no unintended secondary edits.

For a persistent authenticated demo, configure the isolated staging PostgreSQL
database, encryption key, web sessions and worker using the existing deployment
instructions. Migrate staging and create one founder test account through normal
onboarding. Verify the same account in the browser and inbound-message pipeline.
No authentication bypass or public synthetic-webhook route was added.

Before inviting 20 testers, verify:

1. Real model replies and correct edits across the above journey, including
   ambiguous requests, corrections, unrelated questions and provider failures.
2. Dashboard readback and conversation continuity after browser refresh and
   web/worker restart; two authenticated browsers cannot access each other's data.
3. Real worker scheduling, reminder delivery and opt-in proactive check-ins,
   respecting quiet hours, opt-outs, caps and calendar gates.
4. Connected Google read/edit/confirmation flow and real provider retries.
5. Twenty independent sessions under representative load, provider spend and
   latency, plus useful failure feedback and operator monitoring.

The missing runtime values in this process are DATABASE_URL, FIELD_ENCRYPTION_KEY,
ANTHROPIC_API_KEY and ANTHROPIC_MODEL (presence checked only; no secret files read).
No deployment, production migration, live SMS or persistent demo account creation
was performed.

## Railway recovery — September 29, 2026

Retried the existing production web deployment without changing variables or
shipping local demo changes. Deployment 35fd80dd-adad-44ec-8e1b-88688b727d0c
reused commit 380a1091a1ab98155cda07d78d0d32e37b573835 and became Active.
PostgreSQL retained its existing volume; DATABASE_URL already referenced
`${{Postgres.DATABASE_URL}}`. The migration logged successful completion.

Verified public endpoints after recovery:
- `/api/health`: HTTP 200, ok true.
- `/api/ready`: HTTP 200, database ready, worker ready; heartbeat age 21 seconds.

Railway displayed an API-degradation incident during the retry. The original
migration's underlying exception was not logged, so its cause remains unproven.
A local migration error formatter now reports safe nested error classifications
without raw SQL, parameters or credentials. Full `npm run check` passed with
265 tests across 51 files. This diagnostic change is not yet deployed.

Recovery checks do not establish live AI quality, external calendar behavior,
or 20-user demo readiness. The live iteration gates above remain open.

## Iteration 3 — stricter evaluation, September 29, 2026

Candidate commit: 1c70f2c, branch codex/demo-readiness (local).
Full npm run check passed: 266 tests across 52 files, lint, typecheck,
production build and operations compilation.

The 14-step scripted workspace journey now detects unintended record changes,
requires edits to preserve record identity and unrelated fields, verifies that
another account's seeded private note stays unchanged and absent from replies,
and replays every inbound message to check for duplicate mutations/replies.
All 14 turns and their replays passed. A regression deliberately corrupts a
recipe while preserving the requested serving count; the new evaluator catches
what the prior success predicate missed. Twenty-account isolation passed again.

Browser sample review verified Save recipe -> Plan for dinner: the recipe was
added to the dinner section. This closes the earlier unverified preview click.
Sample state still resets on reload and is not an authenticated live AI result.

Railway console presence checks confirmed ANTHROPIC_API_KEY and ANTHROPIC_MODEL
exist in the running web container without revealing either value. Its older
revision lacks the simulation scripts. The proposed live path is an isolated
candidate checkout with temporary PGlite and captured SMS inside that runtime.
No candidate code has been run there yet. Publication of the candidate branch
was blocked by automatic approval review because the existing GitHub repository
is public; explicit publication approval has been requested.

AI quality: unrated, pending real model transcripts. Release-readiness remains
4/10 under the earlier evaluation; this is a statement of incomplete evidence,
not a claim that the observed live AI failed. Persistent demo account, real
worker/browser journey and live provider gates remain open.

## Live iteration 1 — real Anthropic evaluation

Ran candidate 1c70f2c in an isolated temporary directory inside the existing
Railway web container using its configured claude-sonnet-4-6 model. The evaluation
process did not receive DATABASE_URL or provider sending secrets. It used a
fresh temporary PGlite database, synthetic accounts, captured messaging transport
and fixture calendar responses. Production application code was not replaced.

Workspace journey: 14/14 state checks passed, including all replay checks and
cross-account sentinel checks. Downloaded exact replies and state evidence to
qa/workspace-live-iteration-1.md and .json. The browser sample separately verified
recipe creation and planning it for dinner.

Broader assistant journey: 33 scenario prompts plus replay/malformed-media and
separate-user checks. One automated issue: the Friday calendar lookup returned
a fallback without calling the agenda tool. Other manually observed defects:
- Invented Recipes, Meal Plans, Food Log, Workouts, Groceries and Notes tabs.
- Directed a saved routine to the Wake & Wind Down placeholder.
- Repeated generic celebrations, extra questions and redundant confirmations.
- Suggested enabling an unimplemented email integration in Extensions.
- Promised proactive messages after a fixture explicitly said delivery was disabled.

Score: 6/10 for the tested assistant/workspace paths. The state edits and shared
context worked, but navigation and capability claims were misleading. This is
not a release-readiness approval for 20 people. Subsequent code changes ground
navigation, constrain capability claims, and return check-in tool outcomes
without model embellishment. Smart-quote normalization addresses a reproducible
calendar-lookup rejection path; the original model tool payload was not captured,
so that specific failure's cause is not conclusively established.
