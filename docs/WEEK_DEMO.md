# Week-in-life demo evaluation

## Scope and scoring

Run a confused first-time user's journey across onboarding, conversational help,
tasks/goals, routines/focus, food/meals/movement/notes, reminders, web search and
calendar changes. Evaluate the real account separately from isolated model runs.
Do not present simulated time, captured SMS or calendar fixtures as real delivery.

Score each iteration on correct actions (35%), context and replies (25%), usable
dashboard/onboarding (20%), integration behavior (10%) and reliability/account
isolation (10%). A broken core action or account leak prevents a passing demo
rating. Missing/unverified integrations remain gaps; unsupported features cannot
be counted as working because the assistant honestly describes their absence.
The requested target is at least 8/10, supported by observed results.

## Deployment baseline

PR #7 merged with approval on September 29, 2026 at revision
cd3448fd4c86ec532b81745797b44ed8410df781. Its local validation passed 276 tests,
lint, typecheck, Next.js production build and worker/operations compilation.
Railway web and worker deployments were triggered, and both service-specific
AUTONOMOUS_SENDING_ENABLED values were staged as false for the demo canary.
Railway displayed an API degradation incident and builds initially remained
queued/initializing. Migrations subsequently completed, and both services are
online. On September 29 the deployed smoke checks passed: web/public pages,
database readiness, worker readiness, shadow mode enabled and autonomous sending
disabled. This verifies runtime readiness, not AI-provider availability.

## Isolated evaluation

Candidate a00ed75 adds `npx tsx scripts/simulate-week.ts`. Its `--scripted` run
passed 35 turns, lint and typecheck. This only validates the harness/code paths.
The live run uses the existing Anthropic configuration inside Railway, temporary
PGlite state, captured SMS, fixture calendar events and simulated January 11–17,
2027 time. Production database/provider credentials are removed from that test
process. Its model replies and state snapshots require manual review before rating.

## Real-account checks still required

The user chose a separate demo account and will handle phone and Google sign-in.
Test browser refresh/persistence, shared SMS/web context, worker completion,
food search/barcodes, focus/routines and Google Calendar confirmation/cancellation.
Keep all created records clearly labeled as demo data. Real carrier and Google
results must be recorded independently of the synthetic harness.

Google Health / Health Connect is currently a disabled planned Android feature,
not a working connector. Native installation, scheduled hardware alarms/lights
and health-data access are not provided by this candidate.

## Live iteration 1 — 4/10

The 35-turn live run completed on candidate a00ed75. Thirteen state checks failed;
manual review found 18 AI-service fallback replies (some read-only turns had
incorrectly passed the original state-only evaluator). The first 15 turns worked:
recipe edits preserved details, planned meals stayed separate from eaten food,
routine/workout/grocery/note edits matched the account, and task/goal paths worked.
Later requests failed after the provider became unavailable. A separate minimal
Anthropic request returned HTTP 400, invalid_request_error, with a billing/credit
classification. No raw credential or provider error body was printed.

Score: 4/10 for this observed week run. Many requested actions could not complete;
this supersedes the earlier shorter run's 7/10 for the present test conditions.
Raw synthetic transcript/state are retained locally in
qa/week-live-iteration-1.md and .json.

## Iteration 2 preparation — live rating pending

Provider billing and configuration errors now produce a restoration message
instead of encouraging an immediate retry. Provider error text is discarded;
logs retain only the safe category and HTTP status. A completed mutation still
returns its verified acknowledgment if the final model response fails.

The evaluator now fails provider fallback replies even on read-only turns, stops
after a permanent provider error, and labels remaining turns not run. It no longer
counts unavailable AI as a successful conversational response. The updated
scripted week passes all 35 turns; these are fixtures, not live AI output.

A new minimal probe on September 29 still returned HTTP 400 with a billing/credit
classification. Restoring credits in the Anthropic workspace owning Railway's key
is required for a meaningful live rerun. Added Codex usage does not repair that
separate provider account. The observed live score remains 4/10 pending retesting.

Validation for these fixes: `npm run check` passed lint, typecheck, 283 tests in
54 files, the Next.js production build and operations compilation. The 35-turn
scripted week and deployed smoke checks also passed. Real phone/Google sign-in
is still awaiting the separate demo account; those checks have not been claimed.
