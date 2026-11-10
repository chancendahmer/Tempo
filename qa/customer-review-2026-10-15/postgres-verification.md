# Isolated PostgreSQL and authenticated HTTP verification

Performed 2026-10-15 by the independent customer reviewer in the `tempo-calm-ui` worktree. All state is synthetic and local. No production database, carrier, Google account, or live model was used.

## Runtime

- PostgreSQL 17.11 Windows binaries downloaded from the [official EnterpriseDB distribution page](https://www.enterprisedb.com/download-postgresql-binaries?lang=en), release file ID 1260616. The older `tempo-private-beta-pg17/pgsql/bin` directory was empty.
- New cluster: `C:/Users/chanc/AppData/Local/Temp/tempo-ui-release-pg17/data`.
- Binaries: `C:/Users/chanc/AppData/Local/Temp/tempo-ui-release-pg17/pgsql/bin`.
- `initdb -U postgres -A trust --encoding=UTF8 --locale=C` created the disposable cluster. Server binds only `127.0.0.1`, port `55437`. This local trust configuration is for synthetic QA, not deployment.
- Database: `postgresql://postgres@127.0.0.1:55437/tempo_ui_release`.
- Recovery database: `postgresql://postgres@127.0.0.1:55437/tempo_ui_release_recovery_test`.
- Candidate HTTP server: `http://localhost:3101`. The parent agent owns this process. The cluster remains running so the candidate and independent reviewers can finish validation.

## Actual executed results

| Check | Result | Evidence and boundaries |
|---|---|---|
| PostgreSQL concurrency and recovery suites | **PASS**, 2 files / 3 tests, 13.31 seconds | `postgres-concurrency-recovery.log`. Real migrations, PostgreSQL and pg-boss; 20 synthetic accounts, 4 queue workers, 2 dispatchers, duplicate SMS/web dispatch. Asserted 40 unique processed messages, 20 captured SMS replies, 20 tasks, per-account marker/history isolation. Claim ownership, cancellation rollback, stale-token finalization and recurring-job ownership/recovery are exercised. |
| Restart drill | **PASS**, all 4 durable boundaries | `postgres-restart.log`. Worker processes terminated at domain write, outbound reservation, provider acceptance, and reply persistence. Waited the actual 310 seconds for persisted five-minute claims to expire. No timestamp manipulation. Each boundary retained one task, event, reply and provider acceptance. |
| Ambiguous provider acceptance | **PASS**, blocked safely | The provider-acceptance crash leaves the original inbound message received and its outbound reservation submitting; failed queue/action and per-user key stay blocked. A later message for that account stays queued. This is deliberate prevention of uncertain resend, not successful delivery recovery. |
| Authenticated HTTP persistence and isolation | **PASS**, 16 acceptance groups | `authenticated-http.log` and its runnable `.ts` companion. Normal HTTP sign-in redemption, separate in-memory cookies, real server routes, real PostgreSQL and fresh GET after mutations. Three new isolated test users per execution; shared browser fixtures were not changed. |
| Life-record retention, dated diary and stop-focus boundaries | **PASS after repair**, 19 acceptance groups | `authenticated-history-boundary.log`. Initial run reproduced a routine disappearing behind 1,000 food entries. Independent rerun confirms retention and exact dated coverage. Stop-focus retains unfinished work, rejects a foreign account and safely replays without stopping a newer session. |
| Customer view/model regressions | **PASS**, 6 files / 45 tests | `customer-model-tests.log`. Nutrition, workout plans, routine editor, Today model/calendar and saved-context views. These are automated view/model tests, not browser interaction. |

The queue suites and restart drill use scripted domain decisions and a captured test transport. They prove persistence, transaction, queue and recovery behavior. They do **not** establish live model quality, carrier receipt, SMS throughput, or Google behavior.

### Commands

Run from the worktree root, in PowerShell. These values name only the disposable cluster.

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55437/tempo_ui_release'
$env:TEMPO_RECOVERY_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55437/tempo_ui_release_recovery_test'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
$env:NODE_ENV='test'
$env:LOG_LEVEL='warn'
npm run test -- src/server/jobs/inbound-concurrency.postgres.test.ts src/server/jobs/recover-inbound.postgres.test.ts
npx tsx scripts/reliability-smoke.ts
npx tsx qa/customer-review-2026-10-15/authenticated-http.ts http://localhost:3101
# Optional retention and date-coverage boundary regression; passed after repair.
npx tsx qa/customer-review-2026-10-15/authenticated-http.ts http://localhost:3101 --history-boundary
```

The HTTP script requires the candidate server to use the same local database and the deliberately public test key constructed with `Buffer.alloc(32, 7).toString("base64")`. It never reads a real environment file. It rejects any origin other than `http://localhost:3101`, keeps bearer cookies only in process memory, and prints no tokens.

## HTTP acceptance detail

1. Unactivated session denied (401), sign-in link GET read-only, normal POST redirects (303), second use denied (400), session cookie HttpOnly/SameSite=Lax.
2. Authenticated empty account contains no fictional tasks, goals, items, reminders, messages, busy periods or calendar connection.
3. Foreign-origin write denied (403) without changing check-in state.
4. Goal create duplicate produces one goal; edit persists.
5. Linked task duplicate produces one task; edit, start, focus, completion and reopen persist. Completing its task atomically removes the focus session; finishing task focus through routine completion is rejected.
6. Goal completion persists; abandoned task disappears from active/completed workspace records.
7. Check-in changes and profile name/instructions survive independent reads.
8. Brain-dump note create/edit/delete persists; stale and foreign-account updates/deletes return 409 and do not leak or change content.
9. Routine focus sets the current local day; step editing preserves identity and progress; undo persists.
10. Unknown nutrition stays null; typed patch preserves barcode, amount, unit, source and favorite. Nutrition target singleton enforcement rejects duplicates.
11. Saved fitness program sessions/exercises and workout history persist. Workout edit retains program ID, session name and notes.
12. More than 200 historical tasks/reminders and 100 historical goals do not displace current obligations; truncation flags are true. Other accounts stay empty.
13. A valid two-character note cannot be sent directly as a task, and a valid note with more than 1,000 detail characters cannot be sent directly as a goal. The API correctly returns 400 for incompatible task/goal fields. The original direct browser conversion was reported; the caller now opens an editor and preserves the original note.
14. Optional boundary run: routine and target survive 1,000 newer food entries. Historical days are independently retrievable; exact day coverage marks partial data rather than implying a complete total. Empty dates and invalid dates behave distinctly.
15. Stop-focus keeps the task unfinished and clears its focus; routine stop leaves the step incomplete. Foreign-account attempts are rejected. Duplicate stop replays are safe even after a later session starts.

HTTP writes alone do not prove the browser sends the right patch, that totals render correctly, that focus/keyboard behavior is accessible, or that mobile layout works. Fresh browser evidence must be evaluated independently.

## Seed and cleanup

`seed-local-account.ts http://localhost:3101 populated|empty|outsider` creates or reuses three synthetic fixtures and prints a short-lived sign-in URL using the normal redemption route. No bearer URL is saved in this report. The populated fixture has sample tasks/goals/life records and display-only reminders, with no delivery jobs or external connection. Empty has no records; outsider has a private marker for isolation checks. These are QA fixtures, not proof of end-user signup or SMS verification.

After all local UI work ends, the owner can stop the server and then stop this exact cluster:

```powershell
& 'C:/Users/chanc/AppData/Local/Temp/tempo-ui-release-pg17/pgsql/bin/pg_ctl.exe' -D 'C:/Users/chanc/AppData/Local/Temp/tempo-ui-release-pg17/data' -m fast -w stop
```

The initial PowerShell launcher is still waiting for the server's descendant process; stopping this cluster will allow it to finish. Do not stop unrelated PostgreSQL or Node processes. Test databases and disposable fixtures may remain for reproducibility; no recursive cleanup has been performed.
