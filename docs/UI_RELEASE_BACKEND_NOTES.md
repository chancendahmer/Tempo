# UI release backend notes — 2026-10-15

Audit scope: the working candidate on `codex/tempo-calm-ui`, based on
`ab994c0d22802b4af794d23992d4657cdabbf7fa` (also the locally available
`origin/codex/tempo-calm-ui`). The locally available `origin/main` is
`86ae01023abcf24bcc8da9ed9d367192e14a29ae`. These Git references do not independently
identify the revisions currently running in production. No deployment, production
database access, or paid provider call was performed for this audit.

## Storage and migration contract

There is **no new SQL migration, database enum, column, or index** in this
candidate relative to either checked reference. `drizzle/` and
`src/server/db/schema.ts` are unchanged. Existing journaled migrations remain
prerequisites, including `0022_life_workspace.sql` (JSONB life records and action
receipts) and `0023_third_mandroid.sql` (reminder source operations).

New state uses existing tables:

- JSONB item kinds: `pantry`, `nutrition_target`, and `workout_plan`.
- Optional metadata: food favorites; workout program/session/notes; meal
  `ingredientServings` and `groceriesEnabled`; grocery quantity/unit/meal sources.
- Existing task states/events implement reopen and stop-focus; no new enum value.
- Existing action receipts protect versioned workspace writes, stop-focus, and
  batch reminder cancellation. Keep receipts with the data they protect.

Both checked Railway configs currently run the journaled migration runner:
web uses `node dist-ops/scripts/migrate.js`; worker uses `npm run db:migrate`.
Both pass through `withMigrationLock`, using one dedicated connection and the
same PostgreSQL advisory lock. The older statement in `DEPLOYMENT.md` that only
web migrates does not describe these checked configs. Do not manually apply SQL.

## Version and caller compatibility

Deploy web and worker from the **same tested candidate revision**. Mixed-version
writes are not supported. Older schemas reject the new item kinds and strip
unrecognized fields from existing kinds when parsing a replacement or patch.
Losing meal basis or grocery sources can change quantities or turn a derived
grocery into an unrelated manual entry. Old workers also lack new command
semantics. No automatic downgrade or backfill is included.

The workspace URL and existing action shapes remain available. Additions are
`sourceRecipeId` on meal creation/save, `stop_focus`, `reopen_task`, and an optional
validated `?date=YYYY-MM-DD` read parameter. Omitted dates use account-local today.
Responses add coverage/truncation fields; clients must not treat a bounded diary
as a complete total. Reads now reconcile derived groceries under the account
lock, including expiry of past meal sources; workspace GET therefore is not a
database-read-only operation.

Assistant and UI meal writes share `mutateWorkspace` and grocery reconciliation.
Recipe selection copies a snapshot and serving basis; later recipe edits do not
rewrite that snapshot. Legacy meals without `groceriesEnabled: true` do not
silently generate groceries until explicitly saved into the new flow. Manual
groceries remain separate. Purchase checkboxes are not pantry stock, and unknown
pantry quantity does not remove a shopping need.

`cancel_reminders` is one bounded command for 2–8 exact IDs and expected times.
The production parser requires a current lookup and separate semantic permission.
The repository locks the owned inbound message and target rows, refuses a stale,
foreign, duplicate, or sending target without changing the others, and commits
row/job cancellation with a fingerprinted receipt. Replays return that receipt
without cancelling later changes. Production SMS and web processing use this
same Drizzle repository. Single cancellation callers are unchanged; custom
repositories lacking optional `cancelMany` return an explicit no-change result.
Existing queue names, payloads, delivery ownership, opt-out and consent gates are
unchanged. Direct domain callers still must supply trusted authorized context.

## Evidence and limits

- Cancellation repair: 196 targeted tests across eight files, lint, typecheck,
  and the provider-free 33-turn assistant simulation passed. Independent review
  found no concrete cancellation safety defect in the inspected changes.
- Real local PostgreSQL verification: 20-account concurrency/isolation and four
  actual worker restart boundaries passed with scripted decisions and captured
  transport. See [PostgreSQL verification](../qa/customer-review-2026-10-15/postgres-verification.md).
- Authenticated HTTP checks cover version conflicts, account isolation, recipe
  and meal persistence, singleton targets, focus stop/replay, retention, and dated
  diary boundaries. The no-date Kiritimati test returned all 600 selected-day
  entries behind 1,001 other-day entries, then reported 1,000/1,001 as truncated.
  See [default-day evidence](../qa/customer-review-2026-10-15/default-diary-http-results.json).
- Fresh real-model/local-PG web cancellation passed: `list_reminders` then
  `cancel_reminders`, explicit batch authorization, both original IDs cancelled,
  all four original/rescheduled delivery actions cancelled, source processed and
  action completed. See [message-specific proof](../qa/release-2026-10-15-live/web-message-8e4a7038-1c43-4711-a16d-3ae20ef9a63d.json).

These are local synthetic-account proofs. They do not prove production rollout,
carrier delivery/acceptance races, Google behavior, large-account throughput, or
general live-model reliability. The client retry tracker is in-memory and does
not establish durable offline/reload recovery. Per-kind and selected-day limits
are explicit; the database work still scales with account history. Final release
acceptance also requires the parent's broad `npm run check` after all concurrent
changes, including the separate onboarding repair, have settled.

## Safe rollout and rollback prerequisites

1. Record actual web/worker revisions, migration journal state, and a tested
   recoverable database backup with its matching encryption key. Preserve job,
   message, event, and receipt history.
2. Coordinate both service versions and prevent old writers from processing
   candidate data. During a rollback, suspend workspace access (GET also
   reconciles), mutation ingress, and stop/drain worker processing using the
   deployment controls; do not assume the autonomous
   sending switch stops user-requested reminder delivery or web mutations.
3. Apply the existing operations safeguards: disable autonomous sending, enable
   intervention shadow mode, and clear the proactive canary allowlist. These
   measures supplement, rather than replace, stopping incompatible writers.
4. Prefer a forward fix. Before resuming an older revision, verify on an isolated
   restored copy that it preserves the candidate JSON kinds/fields and receipts;
   otherwise retain candidate-compatible write paths or keep writes suspended.
   Reverting binaries alone is not a verified safe data downgrade.
5. Do not drop additive schema, erase new records, reset ambiguous outbound
   submissions, or delete receipts/jobs to make readiness green. Reconcile any
   provider acceptance ambiguity using the existing operations procedure.
6. Resume only after web and worker compatibility, readiness, current-state
   reads, and one controlled create/edit/retry/cancel journey are verified.

This audit changes documentation only. It does not assert a production rollback
drill or authorize deployment.
