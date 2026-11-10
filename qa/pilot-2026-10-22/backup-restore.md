# Local synthetic backup and restore rehearsal

Executed 2026-10-22 by the independent C1/operations agent in the adaptive worktree. Machine-readable results: [backup-restore.json](backup-restore.json). Reproduce from the repository root with:

```powershell
npx tsx scripts/pilot-restore-check.ts
```

The script accepts no arguments and uses the existing exact loopback fixture at `127.0.0.1:55437`, with PostgreSQL 17.11 `pg_dump`/`pg_restore` binaries under `C:/Users/chanc/.codex/runtimes/tempo-pg17-20261022/pgsql/bin`. It never reads environment files, dumps the preview database, starts an application worker, calls providers, or restarts the PostgreSQL cluster. The existing preview connection is used only as an administration connection to create/drop two randomly named run-owned databases. Every database create/drop is guarded against the exact generated source/target names. A failed run reports its phase; the hard deadline identifies the owned databases if manual cleanup is required.

The source database receives all 34 current migrations through the shared advisory-lock migrator. Synthetic records include a verified account; encrypted calendar access/refresh tokens; a task; encrypted feedback with an idempotent receipt and rate-limit bucket; scheduled, completed and failed application jobs; a settled AI attempt; and an uncertain AI attempt retaining a 100-microdollar, one-call global commitment. A pg-boss client creates one pending and one completed synthetic queue job, with no application handler registered. The corresponding application rows reference these queue IDs. Its scheduler/supervisor are disabled and the client is stopped before the snapshot.

The custom archive stays in process memory, is passed to `pg_restore` on stdin, then is zeroed after verification. No backup file or encryption key is persisted. Before constructing Node PostgreSQL or pg-boss clients, this standalone script clears inherited `PG*` variables by name without inspecting or printing their values, and sets `PGPASSFILE=NUL` to prevent default password-file fallback. PostgreSQL child tools receive explicit connection coordinates and a minimal environment without inherited PG password/service/options settings. Their diagnostic output is not printed.

The second database starts empty. The restore preserved exact record JSON across all 55 public, drizzle and pg-boss tables; constraints; indexes; enum label order; sequence values; and migration ledger rows. `pgboss.job` includes its partition rows, so the reported two rows in both parent and common partition represent the same two jobs, not four jobs. Internal fractional enum rank numbers can be renumbered by `pg_dump`; the comparison checks the semantic enum order rather than physical rank values.

Matching ephemeral keys decrypted both token fields and feedback, while an incorrect key failed. Replaying the feedback request returned its original receipt. Rerunning the shared migrator changed no records or catalog definitions. Restored check, foreign-key and uniqueness constraints rejected invalid task estimates, orphan tasks and duplicate job idempotency keys. A rolled-back account deletion verified that attempt account references become null while global uncertain debt remains. The final snapshot remained unchanged. Both run-owned databases were dropped before the success evidence was written.

The current linked JSON records dump, restore and verification timings; each rerun replaces that evidence with its own archive hash and measurements. These small synthetic timings are not production RTO/RPO measurements. The evidence proves a local logical archive round trip, including durable queue state, but does not prove queue execution after restoration, hosted/PITR backups, provider reconciliation, key custody/recovery, or production restore capacity. Those remain operational gates in `docs/OPERATIONS.md`.

## Additive rollback compatibility

`docs/DEPLOYMENT.md` directs additive migrations before new code and retains additive schema and the migration ledger during application rollback. The rehearsal's unchanged second migration run is consistent with that guidance; it does not execute old application code against the restored schema or establish every historical release's compatibility.

`docs/PILOT_AI_ACCOUNTING.md` additionally requires retaining the accounting ledger and stopping AI-producing processes/calls before any rollback to code that lacks metering. Accounting mode `off` is not a budget-safe rollback. Preserve uncertain commitments and reconcile them explicitly rather than releasing them during recovery. No old worker was started and no operating caps or production configuration were introduced here.

Validation: the executable restore regression passed against real local PostgreSQL; final raw `npm run lint` and `npm run typecheck` both passed. No full release check was run for this isolated synthetic operational script; the root agent owns the broader release verification.
