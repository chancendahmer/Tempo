# Daily beta release evidence — 2026-10-05

## Decision

Ship this reliability candidate for a supervised five-person pilot after deployment health is verified. Expand to twenty only after the pilot gates in PRIVATE_BETA_PILOT.md pass. This is not evidence for an unattended commercial launch or a 9/10 product. Engineering assessment: 8/10 for a controlled demo, not a measured customer score. Carrier delivery, real Google permissions and multi-day human experience remain separate gates.

## Implemented

- All model and heuristic task/goal/memory/life writes pass turn authorization. Explicit no-edit requests, negative consent, current-record ownership, versions and Calendar confirmations remain enforced.
- Existing life records use typed patches; changing servings/date preserves omitted fields. Bounded current-record retrieval includes candidate matches when natural-language dates cause an exact search miss, without inferring authorization from a match.
- Pure SMS replies preserve request links. PR21's multi-reminder creation, reminder-ID lookup and clarification protections remain intact. Same-day paired time changes now work; ambiguous multi-day/multi-time pairings still ask for clarification.
- Daily-briefing reminders read current tasks, goals, reminders and Calendar at dispatch. Once a body is reserved, retries reuse it. Ordinary reminders retain their text.
- Inbound processing uses durable ownership tokens and guarded transactions. Saved edit receipts and replies survive worker death. Known-unsent reservations resume; uncertain provider acceptance requires reconciliation instead of an automatic duplicate send.
- Calendar/context recurring jobs use durable attempt ownership and one successor per completion. Queue readiness detects blocked accounts, stale inbound work and uncertain outbound submissions. An account-scoped, audited failed-job recovery command defaults to dry run.
- Calendar reconnect errors, account loading failures and small touch controls have clearer UI handling. No hardware alarm reliability is implied.

## Validation evidence

- Full npm run check: lint, typecheck, tests, Next production build and ops build. Final result recorded in the release PR.
- Scripted assistant: 33 scenario turns, duplicate ingress and second-account checks; zero detected issues. Scripted workspace: 14/14 checks. These are code-path tests, not live AI responses.
- Actual PostgreSQL: two dispatchers, four consumers, twenty isolated accounts, duplicate SMS ingress plus web follow-ups; forty processed inbound messages and twenty captured SMS replies. Recurring takeover/duplicate completion and two operator recovery tests passed. No real provider traffic.
- Restart drill: killed four real child processes after domain write, outbound reservation, provider acceptance and reply persistence. After actual lease expiry, the three unambiguous cases recovered one edit/reply; uncertain provider acceptance stayed held without duplicate submission. Providers and decisions were fixtures.
- Actual Claude Sonnet 4.6 with fictional PGlite accounts: workspace operations, advice-only/negative consent, check-in opt-in/out, reminder batches, morning clarification, Calendar proposal/YES and separate-account recall were exercised. Duplicate ingress was replayed without a second mutation.
- Iteration findings: same-day multi-time edits initially rejected; corrected and replayed successfully. A simulator timestamp mismatch caused a false day-validation failure; corrected to use the injected clock. Missing morning time now asks one focused question. Meal lookup initially missed a natural-language date; a failing regression and successful live repair replay cover it.
- Last full workspace replay had twelve of fourteen end-to-end steps work: the meal move needed the subsequent fix, and recipe recall hit a transient provider failure. Later focused meal replay succeeded. Do not summarize this as a flawless full live run.
- Paid test ledger: approximately $4.78 confirmed token usage, $4.86 including a conservative reservation for an interrupted request, below the approved $5. Raw synthetic evidence is local under qa/daily-beta-live; do not reuse or reset that ledger to spend again without approval. One early output file was overwritten by the harness; subsequent runs use distinct transcript paths.
- Browser preview: desktop Calendar, 390px mobile layout without horizontal overflow, navigation, full-screen focus timer, pause/resume controls and task completion. Preview uses sample data; this does not prove authenticated persistence or hardware behavior.

## Remaining limits

No new real carrier delivery, real Calendar edit, backup restore, full-day proactive pilot or physical wake/brightness/audio check was completed in this run. External alert delivery is not configured by these changes. Authorization classification can still ask unnecessary clarifications. General compound writes remain limited outside supported atomic batches. Exact-once carrier delivery cannot be promised after uncertain network acceptance. Google Health remains unsupported. Keep these distinctions in investor demonstrations.

## Reproduction

Run npm run check and npm run simulate:assistant -- --scripted. For database checks, set TEST_DATABASE_URL to a disposable local PostgreSQL database and run the inbound-concurrency.postgres.test.ts test and scripts/reliability-smoke.ts. The restart drill takes over five minutes. Use TEMPO_RECOVERY_TEST_DATABASE_URL for recover-inbound.postgres.test.ts; never point these commands at production. Paid replay uses scripts/daily-beta-live.ts and requires a new approved budget if the existing cumulative ledger is exhausted. Credentials are loaded at runtime, never printed.

## Production verification follow-up

PR22 deployed both services on October 5. New queue diagnostics identified 35 legacy outbound failures with unknown provider acceptance and three stale consent/onboarding records. The three inbound records had durable consent/delegation evidence and no assistant processing job: migration 0027 corrects that bookkeeping and ingress now marks these paths complete transactionally. Unknown or worker-owned requests are excluded. The 35 outbound attempts remain held unless an operator explicitly retires them without resending or reconciles provider receipts; deployment success alone is not a green pilot gate.
