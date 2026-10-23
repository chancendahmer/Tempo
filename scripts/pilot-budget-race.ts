/** Isolated real PostgreSQL accounting race; no env loading or provider calls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { DrizzleAiBudgetRepository } from "../src/server/db/repositories/ai-budget-repository";
import type { AiBudgetReservationInput } from "../src/server/domain/ai-budget";
import * as schema from "../src/server/db/schema";
import { pilotLoadConfig, PILOT_RUNTIME_MS } from "./pilot-load-config";

let phase = "configuration";
function assertOwned(name: string, runId: string) {
  assert.ok(/^[a-f0-9]{16}$/.test(runId) && name === `tempo_pilot_budget_${runId}_test`, "Refusing a database outside this budget race");
}
async function main() {
  assert.equal(process.argv.length, 2, "This drill accepts no arguments and only uses the explicit local fixture");
  const { adminUrl } = pilotLoadConfig([]); // Exact loopback:55437 URL validation, no environment fallback.
  const runId = randomUUID().replaceAll("-", "").slice(0, 16);
  const name = `tempo_pilot_budget_${runId}_test`;
  assertOwned(name, runId);
  const target = new URL(adminUrl); target.pathname = `/${name}`;
  const options = { connectionString: target.toString(), max: 10, connectionTimeoutMillis: 3_000, query_timeout: 10_000, statement_timeout: 10_000 };
  const admin = new Pool({ connectionString: adminUrl, max: 1, connectionTimeoutMillis: 3_000, query_timeout: 5_000 });
  const pools = [new Pool(options), new Pool(options)];
  const repositories = pools.map(pool => new DrizzleAiBudgetRepository(drizzle(pool, { schema })));
  const started = performance.now();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External HTTP is disabled in this accounting drill"); };
  const watchdog = setTimeout(() => {
    process.stderr.write(JSON.stringify({ passed: false, phase, reason: "hard_runtime_ceiling", isolatedDatabase: name }) + "\n");
    process.exit(1);
  }, PILOT_RUNTIME_MS);
  watchdog.unref();
  let created = false;
  let removed = false;
  let report: Record<string, unknown> | undefined;
  try {
    phase = "database_create";
    await admin.query(`CREATE DATABASE "${name}"`); created = true;
    phase = "migrations";
    await migrate(drizzle(pools[0]), { migrationsFolder: "drizzle" });
    const fixtures = await pools[0].query<{ id: string }>("insert into users (id,phone_e164) select gen_random_uuid(), '+1202555' || lpad(n::text,4,'0') from generate_series(100,199) n returning id");
    const now = new Date("2026-10-22T12:00:00Z");
    const policy = { globalDailyMicrodollars: 1_000, accountDailyMicrodollars: 100, globalDailyCalls: 10, accountDailyCalls: 1 };
    const make = (accountId: string, overrides: Partial<AiBudgetReservationInput> = {}): AiBudgetReservationInput => ({
      attemptId: randomUUID(), accountId, executionId: randomUUID(), operation: "assistant", model: "synthetic", priceVersion: "synthetic-v1", policyVersion: "synthetic-v1", reservedMicrodollars: 100, policy, now, ...overrides,
    });
    phase = "global_reservation_race";
    const requests = fixtures.rows.map(row => make(row.id));
    const results = await Promise.all(requests.map((input, index) => repositories[index % 2].reserve(input)));
    const accepted = requests.filter((_, index) => results[index].allowed);
    assert.equal(accepted.length, 10, "Global cap must admit exactly ten attempts");
    assert.equal(results.filter(result => !result.allowed && result.reason === "budget_exhausted").length, 90);
    const reserved = await pools[0].query<{ cost: string; count: number }>("select coalesce(sum(reserved_microdollars),0)::text cost,count(*)::int count from ai_budget_attempts");
    assert.deepEqual(reserved.rows[0], { cost: "1000", count: 10 });
    phase = "duplicate_reservation_race";
    const replay = await Promise.all(Array.from({ length: 100 }, (_, index) => repositories[index % 2].reserve(accepted[0])));
    assert.ok(replay.every(result => result.allowed && result.replay), "Duplicate reservation must never add commitments");
    phase = "duplicate_claim_race";
    const claims = await Promise.all(Array.from({ length: 100 }, (_, index) => repositories[index % 2].claim(accepted[0].attemptId, now)));
    assert.equal(claims.filter(Boolean).length, 1, "Only one caller may submit a physical attempt");
    const usage = { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, cacheCreation5mInputTokens: 0, cacheCreation1hInputTokens: 0, webSearchRequests: 0 };
    phase = "duplicate_settlement_race";
    const settlement = { attemptId: accepted[0].attemptId, actualMicrodollars: 70, usage, now };
    const settlements = await Promise.all(Array.from({ length: 100 }, (_, index) => repositories[index % 2].settle(settlement)));
    assert.equal(settlements.filter(result => result === "settled").length, 1);
    assert.equal(settlements.filter(result => result === "replay").length, 99);
    assert.equal(await repositories[1].settle({ ...settlement, actualMicrodollars: 71 }), "conflict");
    for (const [index, input] of accepted.slice(1).entries()) {
      const repository = repositories[index % 2];
      assert.equal(await repository.claim(input.attemptId, now), true);
      assert.equal(await repository.settle({ ...settlement, attemptId: input.attemptId }), "settled");
    }
    const first = await pools[0].query("select settled_microdollars::text cost,settled_calls::int calls,outstanding_microdollars::text debt,outstanding_calls::int unresolved from ai_budget_states where scope_key='global'");
    assert.deepEqual(first.rows[0], { cost: "700", calls: 10, debt: "0", unresolved: 0 });
    phase = "account_reservation_race";
    const tomorrow = new Date("2026-10-23T12:00:00Z");
    const accountPolicy = { globalDailyMicrodollars: 20_000, accountDailyMicrodollars: 100, globalDailyCalls: 200, accountDailyCalls: 1 };
    const pairs = fixtures.rows.flatMap(row => [make(row.id, { now: tomorrow, policy: accountPolicy }), make(row.id, { now: tomorrow, policy: accountPolicy })]);
    const pairResults = await Promise.all(pairs.map((input, index) => repositories[index % 2].reserve(input)));
    const accountAccepted = pairs.filter((_, index) => pairResults[index].allowed);
    assert.equal(accountAccepted.length, 100, "Independent account caps must admit exactly one of each pair");
    assert.equal(new Set(accountAccepted.map(input => input.accountId)).size, 100);
    assert.equal(pairResults.filter(result => !result.allowed && result.reason === "budget_exhausted").length, 100);
    phase = "drain_account_commitments";
    await Promise.all(accountAccepted.map(async (input, index) => {
      const repository = repositories[index % 2];
      assert.equal(await repository.claim(input.attemptId, tomorrow), true);
      assert.equal(await repository.settle({ ...settlement, attemptId: input.attemptId, actualMicrodollars: 0, now: tomorrow }), "settled");
    }));
    phase = "final_invariants";
    const totals = await pools[0].query("select count(*)::int attempts,count(*) filter(where state='settled')::int settled,coalesce(sum(actual_microdollars),0)::text cost from ai_budget_attempts");
    assert.deepEqual(totals.rows[0], { attempts: 110, settled: 110, cost: "700" });
    const debt = await pools[0].query("select coalesce(sum(outstanding_microdollars),0)::text cost,coalesce(sum(outstanding_calls),0)::int calls from ai_budget_states");
    assert.deepEqual(debt.rows[0], { cost: "0", calls: 0 });
    const globalFinal = await pools[0].query("select settled_microdollars::text cost,settled_calls::int calls from ai_budget_states where scope_key='global'");
    assert.deepEqual(globalFinal.rows[0], { cost: "0", calls: 100 });
    const accountCounts = await pools[0].query("select count(*)::int accounts,min(settled_calls)::int minimum,max(settled_calls)::int maximum from ai_budget_states where scope_key <> 'global'");
    assert.deepEqual(accountCounts.rows[0], { accounts: 100, minimum: 1, maximum: 1 });
    report = { passed: true, evidence: "isolated real PostgreSQL; synthetic pricing/usage; no provider requests", independentPools: 2, accounts: 100, globalRaceAttempts: 100, globalAccepted: accepted.length, globalDenied: 90, globalReservedMicrodollars: reserved.rows[0].cost, globalCapMicrodollars: 1000, duplicateReservations: 100, duplicateClaimWinners: 1, duplicateSettlementWinners: 1, duplicateSettlementReplays: 99, conflictingSettlementRejected: true, accountRaceAttempts: 200, accountAccepted: accountAccepted.length, accountDenied: 100, final: { ...totals.rows[0], outstandingMicrodollars: debt.rows[0].cost, outstandingCalls: debt.rows[0].calls }, runtimeMs: Math.round(performance.now() - started), runtimeCeilingMs: PILOT_RUNTIME_MS };
  } finally {
    try {
      await Promise.all(pools.map(pool => pool.end()));
      if (created) { assertOwned(name, runId); await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); removed = true; }
    } finally { await admin.end(); globalThis.fetch = originalFetch; clearTimeout(watchdog); }
  }
  assert.ok(report && removed, "Success requires a verified run-owned database removal");
  const result = JSON.stringify({ ...report, isolatedDatabaseRemoved: true }, null, 2) + "\n";
  const evidence = resolve("qa/pilot-2026-10-22/c1-budget-race.json");
  await mkdir(dirname(evidence), { recursive: true }); await writeFile(evidence, result);
  process.stdout.write(result);
}
main().catch(() => { process.stderr.write(JSON.stringify({ passed: false, phase, reason: "setup_or_accounting_invariant_failed" }) + "\n"); process.exitCode = 1; });
