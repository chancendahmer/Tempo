/** Synthetic, loopback-only backup/restore drill. No environment files or provider calls. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import * as schema from "../src/server/db/schema";
import { DrizzleAiBudgetRepository } from "../src/server/db/repositories/ai-budget-repository";
import { PilotFeedbackRepository } from "../src/server/db/repositories/pilot-feedback-repository";
import { decryptField, encryptField } from "../src/server/security/field-encryption";
import { withMigrationLock } from "./lib/migration-lock";
import { pilotLoadConfig, PILOT_RUNTIME_MS } from "./pilot-load-config";

const binaries = "C:/Users/chanc/.codex/runtimes/tempo-pg17-20261022/pgsql/bin";
let phase = "configuration";
function owned(name: string, run: string) {
  assert.match(run, /^[a-f0-9]{16}$/);
  assert.ok(name === `tempo_restore_${run}_source_test` || name === `tempo_restore_${run}_target_test`, "Refusing an unowned database");
}
function quote(identifier: string) { return '"' + identifier.replaceAll('"', '""') + '"'; }
async function pgTool(tool: "pg_dump" | "pg_restore", args: string[], input?: Buffer): Promise<Buffer> {
  // Do not inherit PG service/password/options settings. All connection coordinates are explicit.
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PGCONNECT_TIMEOUT: "5", PGPASSFILE: "NUL" };
  return new Promise((accept, reject) => {
    const child = spawn(`${binaries}/${tool}.exe`, ["--host=127.0.0.1", "--port=55437", "--username=postgres", "--no-password", ...args], { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = []; let size = 0;
    const timer = setTimeout(() => child.kill(), 30_000);
    child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 32 * 1024 * 1024) child.kill(); else chunks.push(chunk); });
    child.stderr.resume(); // Never expose SQL, archive contents, or subprocess diagnostics.
    child.stdin.on("error", () => {});
    child.once("error", () => { clearTimeout(timer); reject(new Error("Local PostgreSQL tool failed")); });
    child.once("close", code => { clearTimeout(timer); if (code === 0 && size <= 32 * 1024 * 1024) accept(Buffer.concat(chunks)); else reject(new Error("Local PostgreSQL tool failed")); });
    child.stdin.end(input);
  });
}
async function migrateOwned(pool: Pool) {
  await withMigrationLock(pool, client => migrate(drizzle(client), { migrationsFolder: "drizzle" }));
}
async function snapshot(pool: Pool) {
  const tables = await pool.query<{ schema: string; name: string }>("select schemaname schema,tablename name from pg_tables where schemaname in ('public','drizzle','pgboss') order by schemaname,tablename");
  const records: Record<string, string[]> = {};
  for (const table of tables.rows) {
    const result = await pool.query<{ row: string }>(`select to_jsonb(t)::text row from ${quote(table.schema)}.${quote(table.name)} t order by to_jsonb(t)::text`);
    records[`${table.schema}.${table.name}`] = result.rows.map(row => row.row);
  }
  const constraints = (await pool.query("select n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','drizzle','pgboss') order by 1,2,3")).rows;
  const indexes = (await pool.query("select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname in ('public','drizzle','pgboss') order by 1,2,3")).rows;
  // pg_dump recreates enum ordering, not internal fractional ranks assigned by ALTER TYPE.
  const enums = (await pool.query("select n.nspname,t.typname,e.enumlabel,row_number() over(partition by t.oid order by e.enumsortorder)::int ordinal from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','pgboss') order by 1,2,4")).rows;
  const sequences: Record<string, unknown> = {};
  for (const row of (await pool.query<{ schemaname: string; sequencename: string }>("select schemaname,sequencename from pg_sequences where schemaname in ('public','drizzle','pgboss') order by 1,2")).rows) {
    sequences[`${row.schemaname}.${row.sequencename}`] = (await pool.query(`select last_value::text,is_called from ${quote(row.schemaname)}.${quote(row.sequencename)}`)).rows;
  }
  return { records, constraints, indexes, enums, sequences };
}
async function rejected(pool: Pool, statement: string, parameters: unknown[], code: string) {
  await assert.rejects(pool.query(statement, parameters), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === code));
}
async function main() {
  assert.equal(process.argv.length, 2, "No arguments accepted; only the explicit local fixture is allowed");
  // node-postgres (including pg-boss) otherwise falls back to ambient PG options
  // and password files even when its connection string specifies host/database.
  // This standalone drill owns its process; inspect names only, never values.
  for (const name of Object.keys(process.env)) if (/^PG/i.test(name)) delete process.env[name];
  process.env.PGPASSFILE = "NUL";
  const { adminUrl } = pilotLoadConfig([]);
  const run = randomUUID().replaceAll("-", "").slice(0, 16);
  const names = [`tempo_restore_${run}_source_test`, `tempo_restore_${run}_target_test`];
  const admin = new Pool({ connectionString: adminUrl, max: 1, connectionTimeoutMillis: 3_000, query_timeout: 5_000 });
  const pools = names.map(name => { owned(name, run); const url = new URL(adminUrl); url.pathname = `/${name}`; return new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 3_000, query_timeout: 10_000, statement_timeout: 10_000 }); });
  const created: string[] = []; const removed: string[] = [];
  const started = performance.now(); let report: Record<string, unknown> | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External HTTP disabled in restore drill"); };
  const watchdog = setTimeout(() => { process.stderr.write(JSON.stringify({ passed: false, phase, reason: "hard_runtime_ceiling", ownedDatabases: names }) + "\n"); process.exit(1); }, PILOT_RUNTIME_MS);
  watchdog.unref();
  try {
    phase = "create_owned_databases";
    for (const name of names) { owned(name, run); await admin.query(`CREATE DATABASE ${quote(name)}`); created.push(name); }
    phase = "migrate_source"; await migrateOwned(pools[0]);
    phase = "seed_synthetic_records";
    const db = drizzle(pools[0], { schema }); const now = new Date("2026-10-22T12:00:00Z");
    const key = randomBytes(32).toString("base64"); const account = randomUUID();
    await db.insert(schema.users).values({ id: account, phoneE164: "+12025550199", phoneVerifiedAt: now, timezone: "America/New_York" });
    await db.insert(schema.calendarConnections).values({ userId: account, encryptedAccessToken: encryptField("synthetic-access", key), encryptedRefreshToken: encryptField("synthetic-refresh", key), scopes: ["freebusy"] });
    await db.insert(schema.tasks).values({ userId: account, title: "Synthetic restore task", status: "in_progress", dueAt: now, estimatedMinutes: 15 });
    const feedbackInput = { requestId: randomUUID(), type: "problem" as const, section: "today" as const, impact: "slowed" as const, detail: "Synthetic restore feedback", followUpConsent: false };
    const feedback = await new PilotFeedbackRepository(db).submit(account, feedbackInput, key, now);
    await db.insert(schema.scheduledActions).values(["scheduled", "completed", "failed"].map((status, index) => ({ userId: account, kind: "synthetic_restore", status: status as "scheduled" | "completed" | "failed", idempotencyKey: `restore:${run}:${index}`, queueJobId: `synthetic-job-${index}`, runAt: now, attempts: index, completedAt: status === "completed" ? now : null, payload: { synthetic: true } })));
    const budget = new DrizzleAiBudgetRepository(db);
    const attempts = [randomUUID(), randomUUID()];
    for (const attemptId of attempts) {
      assert.equal((await budget.reserve({ attemptId, accountId: account, executionId: randomUUID(), operation: "assistant", model: "synthetic", priceVersion: "restore-synthetic-v1", policyVersion: "restore-synthetic-v1", reservedMicrodollars: 100, policy: { globalDailyMicrodollars: 1000, accountDailyMicrodollars: 1000, globalDailyCalls: 10, accountDailyCalls: 10 }, now })).allowed, true);
      assert.equal(await budget.claim(attemptId, now), true);
    }
    assert.equal(await budget.settle({ attemptId: attempts[0], actualMicrodollars: 70, usage: { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, cacheCreation5mInputTokens: 0, cacheCreation1hInputTokens: 0, webSearchRequests: 0 }, now }), "settled");
    await budget.markUncertain(attempts[1], "process_failure", now);
    phase = "seed_synthetic_queue";
    const boss = new PgBoss({ connectionString: pools[0].options.connectionString, schema: "pgboss", supervise: false, schedule: false, max: 2, connectionTimeoutMillis: 3_000 });
    let queueError = false; boss.on("error", () => { queueError = true; });
    try {
      await boss.start(); await boss.createQueue("synthetic_restore");
      const completed = await boss.send("synthetic_restore", { synthetic: true }); assert.ok(completed);
      const jobs = await boss.fetch("synthetic_restore"); assert.equal(jobs.length, 1);
      await boss.complete("synthetic_restore", completed);
      const pending = await boss.send("synthetic_restore", { synthetic: true }, { startAfter: "2099-01-01T00:00:00Z" }); assert.ok(pending);
      await pools[0].query("update scheduled_actions set queue_job_id=$1 where status='scheduled'", [pending]);
      await pools[0].query("update scheduled_actions set queue_job_id=$1 where status='completed'", [completed]);
      assert.equal((await boss.getJobById("synthetic_restore", completed))?.state, "completed");
      assert.equal((await boss.getJobById("synthetic_restore", pending))?.state, "created");
      assert.equal(queueError, false);
    } finally { await boss.stop(); }
    const before = await snapshot(pools[0]);
    phase = "dump_source_to_memory"; const dumpStarted = performance.now();
    const archive = await pgTool("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--dbname=${names[0]}`]);
    const dumpMs = Math.round(performance.now() - dumpStarted);
    phase = "restore_fresh_target"; const restoreStarted = performance.now();
    await pgTool("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges", `--dbname=${names[1]}`], archive);
    const restoreMs = Math.round(performance.now() - restoreStarted);
    const after = await snapshot(pools[1]);
    for (const component of ["records", "constraints", "indexes", "enums", "sequences"] as const) {
      phase = `compare_restored_${component}`; assert.deepEqual(after[component], before[component]);
    }
    phase = "decrypt_restored_records";
    const tokens = (await pools[1].query("select encrypted_access_token access,encrypted_refresh_token refresh from calendar_connections")).rows[0];
    assert.equal(decryptField(tokens.access, key), "synthetic-access"); assert.equal(decryptField(tokens.refresh, key), "synthetic-refresh");
    const detail = (await pools[1].query("select encrypted_detail detail from pilot_feedback where id=$1", [feedback.id])).rows[0].detail;
    assert.equal(decryptField(detail, key), feedbackInput.detail);
    assert.throws(() => decryptField(detail, randomBytes(32).toString("base64")));
    phase = "feedback_replay";
    assert.deepEqual(await new PilotFeedbackRepository(drizzle(pools[1], { schema })).submit(account, feedbackInput, key, now), feedback);
    phase = "migrator_idempotence"; await migrateOwned(pools[1]); assert.deepEqual(await snapshot(pools[1]), before);
    phase = "restored_constraint_probes";
    await rejected(pools[1], "insert into tasks(user_id,title,estimated_minutes) values($1,'synthetic',0)", [account], "23514");
    await rejected(pools[1], "insert into tasks(user_id,title) values($1,'synthetic')", [randomUUID()], "23503");
    await rejected(pools[1], "insert into scheduled_actions(kind,idempotency_key,run_at) select kind,idempotency_key,run_at from scheduled_actions limit 1", [], "23505");
    const client = await pools[1].connect();
    try {
      await client.query("BEGIN"); await client.query("delete from users where id=$1", [account]);
      assert.equal((await client.query("select count(*)::int count from ai_budget_attempts where account_id is null")).rows[0].count, 2);
      assert.deepEqual((await client.query("select outstanding_microdollars::text cost,outstanding_calls::int calls from ai_budget_states where scope_key='global'")).rows[0], { cost: "100", calls: 1 });
    } finally { await client.query("ROLLBACK"); client.release(); }
    assert.deepEqual(await snapshot(pools[1]), before);
    report = { passed: true, scope: "isolated local PostgreSQL synthetic backup/restore; no hosted restore or application worker execution", archive: { format: "custom", storage: "memory_only", bytes: archive.length, sha256: createHash("sha256").update(archive).digest("hex") }, dumpMs, restoreMs, comparedTables: Object.keys(before.records).length, populatedTables: Object.fromEntries(Object.entries(before.records).filter(([, rows]) => rows.length).map(([name, rows]) => [name, rows.length])), exactRecordsConstraintsIndexesEnumsSequences: true, matchingKeyDecryption: true, wrongKeyRejected: true, feedbackReplayPreserved: true, migratorRerunUnchanged: true, checkForeignKeyUniqueProbes: true, accountDeletionRetainsGlobalUncertainDebt: true, jobState: "scheduled/completed/failed application scheduled_actions and linked created/completed pg-boss jobs preserved; no application worker execution", runtimeMs: Math.round(performance.now() - started) };
    archive.fill(0);
  } finally {
    try {
      await Promise.all(pools.map(pool => pool.end()));
      for (const name of created.reverse()) { owned(name, run); await admin.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`); removed.push(name); }
    } finally { await admin.end(); globalThis.fetch = originalFetch; clearTimeout(watchdog); }
  }
  assert.ok(report && removed.length === 2, "Success requires removal of both owned databases");
  const result = JSON.stringify({ ...report, ownedDatabasesRemoved: 2 }, null, 2) + "\n";
  await mkdir(resolve("qa/pilot-2026-10-22"), { recursive: true });
  await writeFile(resolve("qa/pilot-2026-10-22/backup-restore.json"), result); process.stdout.write(result);
}
main().catch(() => { process.stderr.write(JSON.stringify({ passed: false, phase, reason: "restore_or_durable_invariant_failed" }) + "\n"); process.exitCode = 1; });
