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
