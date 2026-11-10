/** Root-operated production accounting proof on a fresh, fixed-loopback database. */
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, basename, dirname } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import Anthropic from "@anthropic-ai/sdk";
import { withMigrationLock } from "../../scripts/lib/migration-lock";
import { serverEnvSchema, resetEnvCacheForTests } from "../../src/server/config/env";
import { AI_PRICE_VERSION, SONNET_46_MODEL, HOSTED_SEARCH_MODEL, buildAdmissionEnvelope, priceUsage } from "../../src/server/adapters/llm/ai-pricing";
import { withAiInvocationScope } from "../../src/server/domain/ai-invocation-scope";
import { liveQaSearchQuery, withLiveQaBudget, withLiveQaBudgetFixture, withLiveQaBudgetSearchProbe } from "./live-budget";

const adminUrl = "postgresql://postgres@127.0.0.1:55437/postgres";
const endpoint = "https://api.anthropic.com/v1/messages";
const maxTokens = 16;
const prompt = "Reply with OK.";
const policy = {
  AI_BUDGET_PRICE_VERSION: AI_PRICE_VERSION,
  AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS: "10000000", AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS: "10000000",
  AI_BUDGET_GLOBAL_DAILY_CALLS: "10", AI_BUDGET_ACCOUNT_DAILY_CALLS: "10",
};

async function main() {
  const [mode, runtime, extra] = process.argv.slice(2);
  const mock = mode === "mock" || mode === "search-mock";
  const search = mode === "search" || mode === "search-mock";
  assert.ok(!extra && ((mock && !runtime) || ((mode === "run" || mode === "search") && runtime)), "Use mock, search-mock, run <runtime-directory>, or search <runtime-directory>.");
  const model = search ? HOSTED_SEARCH_MODEL : SONNET_46_MODEL;
  const expectedReservation = search ? 4_080_000 : 6_000_240;
  const expectedSource = "https://www.nist.gov/pml/time-and-frequency-division/time-distribution/internet-time-service-its";
  let apiKey = "synthetic-no-network";
  if (!mock) {
    assert.ok((await stat(runtime!)).isDirectory());
    loadEnvConfig(runtime!, true, { info() {}, error() {} });
    assert.ok(process.env.ANTHROPIC_API_KEY, "Configured runtime key unavailable.");
    apiKey = process.env.ANTHROPIC_API_KEY;
  }
  for (const name of Object.keys(process.env).filter(name => name in serverEnvSchema.shape || /^(PG|ANTHROPIC_)|PROXY$/i.test(name))) delete process.env[name];
  const runId = randomUUID();
  const databaseName = `tempo_meter_${runId.replaceAll("-", "")}`;
  assert.match(databaseName, /^tempo_meter_[0-9a-f]{32}$/);
  const databaseUrl = `postgresql://postgres@127.0.0.1:55437/${databaseName}`;
  Object.assign(process.env, policy, {
    NODE_ENV: "test", LOG_LEVEL: "silent", PGPASSFILE: "NUL", DATABASE_URL: databaseUrl,
    APP_BASE_URL: "http://localhost:3103", ANTHROPIC_API_KEY: apiKey, ANTHROPIC_MODEL: model,
    ANTHROPIC_LOG: "off", AI_BUDGET_MODE: "enforce", ASSISTANT_WEB_SEARCH_ENABLED: "false",
    AUTONOMOUS_SENDING_ENABLED: "false", INTERVENTION_SHADOW_MODE: "true",
  });
  resetEnvCacheForTests();
  const admin = new Pool({ connectionString: adminUrl, max: 1, connectionTimeoutMillis: 3000 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
  const originalFetch = globalThis.fetch;
  let journalDirectory: string | undefined;
  let created = false, passed = false, cleaned = false;
  const proof: Record<string, unknown> = { model, productionMeter: true, providerCalls: mock ? 0 : null, mock, search };
  const artifact = resolve(`qa/pilot-2026-11-10/private/live-transcripts/meter-${runId}.json`);
  try {
    const identity = await admin.query("select current_database() as name, inet_server_addr()::text as address, inet_server_port() as port");
    assert.deepEqual(identity.rows, [{ name: "postgres", address: "127.0.0.1/32", port: 55437 }]);
    await admin.query(`create database "${databaseName}"`);
    created = true;
    await withMigrationLock(pool, async client => { await migrate(drizzle(client), { migrationsFolder: resolve("drizzle") }); });
    const actors = await pool.query("insert into users(phone_e164, profile_instructions, proactive_opt_in) values ($1,$3,false),($2,$3,false) returning id",
      ["+12025550190", "+12025550191", `Synthetic production meter ${runId}`]);
    assert.equal(actors.rowCount, 2);
    const [owner, other] = actors.rows;
    const executionId = randomUUID();
    const { invokePaidMessage } = await import("../../src/server/adapters/llm/paid-invocation");
    if (mock) {
      globalThis.fetch = async () => new Response(JSON.stringify({
        id: "msg_mock", type: "message", role: "assistant", model,
        content: search ? [
          { type: "server_tool_use", name: "web_search", id: "srv_probe" },
          { type: "web_search_tool_result", tool_use_id: "srv_probe", content: [{ type: "web_search_result", url: expectedSource }] },
          { type: "text", text: "The NIST Internet Time Service.", citations: [{ type: "web_search_result_location", url: expectedSource }] },
        ] : [{ type: "text", text: "OK" }], stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 11, output_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
          server_tool_use: search ? { web_search_requests: 1, web_fetch_requests: 0 } : null,
          service_tier: "standard", inference_geo: search ? "not_available" : "global", speed: "standard", output_tokens_details: { text_tokens: 2, thinking_tokens: 0 } },
      }), { headers: { "content-type": "application/json" } });
      journalDirectory = await mkdtemp(join(tmpdir(), "tempo-meter-budget-"));
    }
    const runProof: Parameters<typeof withLiveQaBudget>[0] = async budget => {
      const opening = budget.snapshot();
      proof.sharedBudgetBefore = opening;
      if (search) assert.ok(opening.authorizationAmended && !opening.pending && !opening.halted && opening.capMicrodollars - opening.committedMicrodollars >= 2_080_000);
      const cappedFetch = globalThis.fetch;
      let observations = 0;
      const client = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: 30000,
        fetch: async (resource, init) => {
          assert.equal(observations, 0, "This probe permits one physical provider request.");
          const request = new Request(resource, init);
          assert.equal(request.url, endpoint);
          const body = await request.clone().json();
          if (!search) assert.deepEqual(body, { model: SONNET_46_MODEL, max_tokens: maxTokens,
            messages: [{ role: "user", content: prompt }], service_tier: "standard_only", inference_geo: "global" });
          const submitted = await pool.query("select state, reserved_microdollars::text as reserved from ai_budget_attempts where account_id=$1 and execution_id=$2", [owner.id, executionId]);
          assert.deepEqual(submitted.rows, [{ state: "submitting", reserved: String(expectedReservation) }]);
          assert.equal((await pool.query("select count(*)::int as count from ai_budget_attempts where account_id=$1", [other.id])).rows[0].count, 0);
          observations++;
          proof.guardedSubmissions = observations;
          return cappedFetch(request);
        },
      });
      const scope = { accountId: owner.id, executionId };
      let priced;
      if (search) {
        const { AnthropicWebSearchSession } = await import("../../src/server/adapters/llm/anthropic-web-search");
        const evidence = await withAiInvocationScope(scope, () => new AnthropicWebSearchSession(client).search(liveQaSearchQuery));
        assert.equal(evidence.status, "complete", "The one physical search did not return completed cited evidence.");
        assert.ok(evidence.sources.some(source => /(^|\.)nist\.gov$/i.test(new URL(source).hostname)));
        proof.verifiedOfficialCitations = evidence.sources.filter(source => /(^|\.)nist\.gov$/i.test(new URL(source).hostname));
      } else {
        const response = await withAiInvocationScope(scope, () => invokePaidMessage(client, {
          model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }],
        }, "assistant"));
        assert.match(response.content.flatMap(block => block.type === "text" ? [block.text] : []).join("").trim(), /^OK[.!]?$/i);
        const envelope = buildAdmissionEnvelope({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }],
          inference_geo: "global", service_tier: "standard_only" }, new Date(), policy);
        priced = priceUsage(envelope, response.usage, response.model);
      }
      assert.equal(observations, 1);
      const attempts = await pool.query("select state, model, price_version, reserved_microdollars::text as reserved, actual_microdollars::text as actual, usage, bound_violation from ai_budget_attempts where account_id=$1 and execution_id=$2", [owner.id, executionId]);
      assert.equal(attempts.rows.length, 1);
      if (search) {
        const usage = attempts.rows[0].usage;
        assert.equal(usage.webSearchRequests, 1);
        priced = { usage, actualMicrodollars: usage.inputTokens + 5 * usage.outputTokens + 10_000 };
      }
      assert.ok(priced);
      assert.deepEqual(attempts.rows[0], { state: "settled", model, price_version: AI_PRICE_VERSION,
        reserved: String(expectedReservation), actual: String(priced.actualMicrodollars), usage: priced.usage, bound_violation: false });
      const states = await pool.query("select outstanding_microdollars::text as outstanding, outstanding_calls::int as calls, settled_microdollars::text as settled, settled_calls::int as settled_calls, halted from ai_budget_states order by scope_key");
      assert.deepEqual(states.rows, Array.from({ length: 2 }, () => ({ outstanding: "0", calls: 0, settled: String(priced.actualMicrodollars), settled_calls: 1, halted: false })));
      assert.equal((await pool.query("select count(*)::int as count from ai_budget_attempts where account_id=$1", [other.id])).rows[0].count, 0);
      const closing = budget.snapshot();
      assert.equal(closing.attempts, opening.attempts + 1);
      assert.equal(closing.settledMicrodollars - opening.settledMicrodollars, priced.actualMicrodollars);
      assert.equal(closing.outstandingMicrodollars, opening.outstandingMicrodollars);
      assert.equal(closing.externalCarrierHoldMicrodollars, opening.externalCarrierHoldMicrodollars);
      assert.ok(!closing.halted && !closing.pending);
      Object.assign(proof, { providerCalls: mock ? 0 : 1, mockProviderResponses: mock ? 1 : 0,
        reservedBeforeNetwork: true, claimedBeforeNetwork: true, settled: true, originalReservation: expectedReservation,
        actualMicrodollars: priced.actualMicrodollars, usage: priced.usage, otherAccountUnchanged: true, sharedBudget: closing });
      passed = true;
    };
    if (journalDirectory) {
      if (search) {
        await withLiveQaBudgetFixture(journalDirectory, async () => {});
        await withLiveQaBudgetFixture(journalDirectory, async () => {}, { amendAuthorization: true });
      }
      await withLiveQaBudgetFixture(journalDirectory, runProof, search ? { searchProbe: true } : undefined);
    } else await (search ? withLiveQaBudgetSearchProbe : withLiveQaBudget)(runProof);
  } catch (error) {
    proof.failure = error instanceof Error ? error.name : "unknown";
    process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
    try {
      await (await import("../../src/server/db/client")).closeDatabase();
      await pool.end();
      if (passed && created) {
        assert.match(databaseName, /^tempo_meter_[0-9a-f]{32}$/);
        await admin.query(`drop database "${databaseName}"`);
        cleaned = true;
      }
      if (journalDirectory) {
        assert.equal(dirname(resolve(journalDirectory)), resolve(tmpdir()));
        assert.ok(basename(journalDirectory).startsWith("tempo-meter-budget-"));
        await rm(journalDirectory, { recursive: true });
      }
    } catch {
      proof.cleanupFailed = true;
      passed = false;
      process.exitCode = 1;
    } finally {
      await admin.end().catch(() => {});
      delete process.env.ANTHROPIC_API_KEY;
      resetEnvCacheForTests();
    }
    Object.assign(proof, { passed, databaseCleaned: cleaned, ...(created && !cleaned ? { diagnosticDatabase: databaseName } : {}) });
    await mkdir(resolve("qa/pilot-2026-11-10/private/live-transcripts"), { recursive: true });
    await writeFile(artifact, JSON.stringify(proof, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ passed, mock, providerCalls: proof.providerCalls, actualMicrodollars: proof.actualMicrodollars, databaseCleaned: cleaned, artifact }));
  }
}

void main().catch(error => {
  console.error(JSON.stringify({ passed: false, category: error instanceof Error ? error.name : "unknown" }));
  process.exitCode = 1;
});
