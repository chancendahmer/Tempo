# Isolated account validation — October 18, 2026

Fresh checks on candidate `d1d866c` (`codex/tempo-calm-ui`) passed within the
scope below. This is local synthetic persistence and isolation evidence. It
does not close the connected-provider or deployment gates.

## Runtime restored

- Worktree: `C:/Users/chanc/.codex/worktrees/tempo-calm-ui/Agentic AI Assistant SMS`.
- Existing PostgreSQL 17 cluster preserved at
  `C:/Users/chanc/AppData/Local/Temp/tempo-ui-release-pg17/data` and restarted
  bound to `127.0.0.1:55437`. Database `tempo_ui_release` contained 23 existing
  synthetic accounts before these checks. No cluster initialization, migration,
  fixture overwrite, or broad cleanup was performed.
- Candidate Next.js 16.3.6 development server: `http://localhost:3101`, listener
  bound to `127.0.0.1:3101`, using that database and the deliberately public
  `Buffer.alloc(32, 7)` encryption key.
- Reproducible launcher: `start-candidate.cjs`. It refuses known development
  environment-file paths if present and passes an allowlisted child environment
  without provider credentials. No populated secret file was read.
- Initial process ownership: Next launcher PID 2924, CLI child 40792, listener
  5356; PostgreSQL listener 34720. These identify this run only; verify ownership
  before later stopping processes. No general worker or SMS dispatcher started.

## Fresh results

| Check | Result | Evidence |
|---|---|---|
| Authenticated HTTP persistence/isolation, including history boundary | PASS, 19 acceptance groups | `authenticated-history-boundary.log`; existing `../customer-review-2026-10-15/authenticated-http.ts` executed with `--history-boundary` |
| Account-local default diary, with no date query | PASS | `default-diary-http.log`; existing `../customer-review-2026-10-15/default-diary-http.mjs` |
| PostgreSQL concurrency and recovery suites | PASS, 2 files / 3 tests, 12.41 seconds | `postgres-concurrency-recovery.log`; repository normal test script with explicit isolated local URLs |
| Typecheck | PASS, exit 0 | `typecheck.log`; `npm run typecheck` |
| Lint | PASS, exit 0, no warnings | `lint.log`; `npm run lint` |
| QA launcher syntax | PASS, exit 0 | `node --check qa/customer-review-2026-10-18/start-candidate.cjs` |

HTTP checks used normal one-time-link redemption, real routes and independent
reads after mutation. They covered empty accounts; pending/replayed sign-in;
foreign origin; idempotent task/goal creation; task edits/start/completion/reopen;
focus stop replay and ownership; profile/check-in persistence; stale/foreign
notes; routine step identity and progress; null nutrition and metadata;
singleton nutrition targets; fitness plan/log metadata; deletion; incompatible
note conversion inputs; active records retained amid large histories; durable
routine/target retention beyond 1,000 food entries; and complete, empty,
historical, truncated and invalid dated diary responses.

The default diary run exercised a real date boundary: UTC `2026-10-19` versus
`Pacific/Honolulu` account date `2026-10-18`. It returned the account date,
reported 600 included / 600 total as complete despite 1,001 newer off-date foods,
then reported 1,000 included / 1,001 total as truncated for that account date.

The concurrency suite creates its own temporary database, uses four workers,
two dispatchers and 20 synthetic accounts, and checks duplicate ingestion,
chronology and account isolation. Recovery checks use only
`tempo_ui_release_recovery_test`. These suites use scripted model decisions
and captured transport; they do not send real SMS or evaluate live AI output.

Three new HTTP test accounts and one diary test account were added. Prior shared
populated/empty/outsider browser fixtures were not edited. Records remain in
the disposable cluster for reproducibility. Logs contain no bearer cookies or
sign-in links.

## Reproduction

From the worktree root, after starting the exact existing PostgreSQL cluster:

```powershell
node qa/customer-review-2026-10-18/start-candidate.cjs
# In another shell:
npx tsx qa/customer-review-2026-10-15/authenticated-http.ts http://localhost:3101 --history-boundary
npx tsx qa/customer-review-2026-10-15/default-diary-http.mjs
$env:TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55437/tempo_ui_release'
$env:TEMPO_RECOVERY_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55437/tempo_ui_release_recovery_test'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
$env:NODE_ENV='test'
$env:LOG_LEVEL='warn'
npm run test -- src/server/jobs/inbound-concurrency.postgres.test.ts src/server/jobs/recover-inbound.postgres.test.ts
```

## Remaining evidence limits

No reproducible failure occurred in the checks executed here. HTTP persistence
does not establish that browser controls send correct values, keyboard/mobile
usability, or visual quality. Root owns fresh browser and deployment preflight
evidence. Fresh provider signup, actual SMS receipt, real model behavior,
Calendar read/write/delete, provider callbacks, and deployment compatibility
were not exercised here. No live database/provider, paid API call, merge or
deployment was used.

The five-minute worker termination/restart drill was not rerun. Its October 15
result remains historical evidence, not a fresh October 18 result. Meal HTTP
review was not rerun because its old script operates on the shared populated
fixture and removes matching older review records; preserving those fixtures
takes precedence in this scope.

Starting Next dev regenerated `next-env.d.ts` imports to `.next/dev/types/*`.
This runtime-generated change was reported to root for coordination. No app
source was edited by this validation work.
