import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { liveQaProbeMaxTokens, liveQaProbePrompt, withLiveQaBudgetFixture } from "./live-budget";

const endpoint = "https://api.anthropic.com/v1/messages";
const base = { model: "claude-sonnet-4-6", max_tokens: 100, messages: [{ role: "user" as const, content: "Synthetic example" }] };
const probe = { ...base, max_tokens: liveQaProbeMaxTokens, messages: [{ role: "user", content: liveQaProbePrompt }] };
const headers = { "content-type": "application/json", "x-api-key": "fixture-value", "anthropic-version": "2023-06-01" };
const post = (body: object = base, url = endpoint, extraHeaders = {}) => fetch(url, { method: "POST", headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) });
const success = (model = base.model, usage: object = { input_tokens: 111, output_tokens: 22 }) => new Response(JSON.stringify({
  model, usage, id: "msg_fixture", content: [{ type: "text", text: "Fixture" }], type: "message", role: "assistant",
}), { headers: { "content-type": "application/json" } });
async function folder(t: TestContext) {
  const path = await mkdtemp(join(tmpdir(), "tempo-qa-budget-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
async function events(path: string) {
  const names = (await readdir(path)).filter(name => /^\d{6}\.json$/.test(name)).sort();
  return Promise.all(names.map(async name => JSON.parse(await readFile(join(path, name), "utf8"))));
}

test("durable reservation exists before first network attempt and exact usage survives restart", async t => {
  const path = await folder(t);
  t.mock.method(globalThis, "fetch", async (request: Request) => {
    const ledger = await events(path);
    assert.deepEqual(ledger.map(row => row.kind), ["authorization", "reserve"]);
    assert.equal(ledger[1].reserved, 3_001_500);
    const body = await request.json();
    assert.equal(body.inference_geo, "global");
    assert.equal(body.service_tier, "standard_only");
    assert.equal(request.redirect, "error");
    return success();
  });
  await withLiveQaBudgetFixture(path, async budget => {
    assert.equal((await post()).status, 200);
    assert.equal(budget.snapshot().settledMicrodollars, 663);
    assert.equal(budget.snapshot().outstandingMicrodollars, 0);
  });
  const before = await events(path);
  await withLiveQaBudgetFixture(path, async budget => assert.equal(budget.snapshot().committedMicrodollars, 663));
  assert.deepEqual(await events(path), before);
  assert.doesNotMatch(JSON.stringify(before), /Synthetic example|fixture-value|msg_fixture/);
});

test("concurrent unknown outcomes reserve three requests and block the fourth across restarts", async t => {
  const path = await folder(t);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("secret transport diagnostic"); });
  await withLiveQaBudgetFixture(path, async budget => {
    const result = await Promise.allSettled(Array.from({ length: 4 }, () => post()));
    assert.equal(result.filter(item => item.status === "rejected").length, 4);
    assert.equal(fetchMock.mock.callCount(), 3);
    const current = budget.snapshot();
    assert.equal(current.uncertain, 3);
    assert.equal(current.committedMicrodollars, 9_004_500);
  });
  await withLiveQaBudgetFixture(path, async budget => {
    await assert.rejects(post(), /spending cap/);
    assert.equal(fetchMock.mock.callCount(), 3);
    assert.equal(budget.snapshot().outstandingMicrodollars, 9_004_500);
  });
  assert.doesNotMatch(JSON.stringify(await events(path)), /secret transport diagnostic/);
});

test("a missing terminal record still carries full debt and an existing lock denies another process", async t => {
  const path = await folder(t);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Fixture"); });
  await withLiveQaBudgetFixture(path, async () => {});
  await writeFile(join(path, "000001.json"), JSON.stringify({ kind: "reserve", id: "8ad6c5a2-354a-44c2-b650-aac983069d1d", at: "2026-11-10T00:00:00Z", model: base.model, maxTokens: 100, reserved: 3_001_500 }));
  await writeFile(join(path, "run.lock"), "existing fixture lock");
  await assert.rejects(withLiveQaBudgetFixture(path, async () => assert.fail()), /lock is held/);
  assert.equal(fetchMock.mock.callCount(), 0);
  await rm(join(path, "run.lock"));
  await withLiveQaBudgetFixture(path, async budget => {
    assert.equal(budget.snapshot().pending, 1);
    assert.equal(budget.snapshot().committedMicrodollars, 3_001_500);
    await assert.rejects(withLiveQaBudgetFixture(path, async () => assert.fail()), /active in this process/);
  });
});

test("unpriced provider routes, headers, and nested options cannot submit", async t => {
  const path = await folder(t);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => success());
  await withLiveQaBudgetFixture(path, async budget => {
    for (const value of [
      { ...base, stream: true }, { ...base, thinking: { type: "adaptive" } }, { ...base, speed: "fast" },
      { ...base, inference_geo: "us" }, { ...base, service_tier: "auto" }, { ...base, max_tokens: 5001 },
      { ...base, model: "claude-haiku-4-5" }, { ...base, tools: [{ type: "web_search_20250305", name: "web_search" }] },
      { ...base, system: [{ type: "text", text: "Synthetic", cache_control: { type: "ephemeral" } }] },
      { ...base, messages: [{ role: "user", content: [{ type: "image", source: {} }] }] },
    ]) await assert.rejects(post(value), /options refused/);
    await assert.rejects(post(base, "https://proxy.example.test/v1/messages"), /route or headers/);
    await assert.rejects(post(base, endpoint + "/count_tokens"), /route or headers/);
    await assert.rejects(post(base, endpoint, { "anthropic-beta": "some-feature" }), /route or headers/);
    assert.equal(budget.snapshot().attempts, 0);
  });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("the actual SDK retries through the guard and the second attempt keeps separate accounting", async t => {
  const path = await folder(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    const ledger = await events(path);
    assert.equal(ledger.filter(row => row.kind === "reserve").length, calls);
    return calls === 1 ? new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "private error detail" } }), { status: 529, headers: { "retry-after-ms": "1" } }) : success();
  });
  await withLiveQaBudgetFixture(path, async budget => {
    const sdk = new Anthropic({ apiKey: "fixture-value", authToken: null, baseURL: "https://api.anthropic.com", maxRetries: 1, timeout: 5000 });
    assert.equal((await sdk.messages.create(base)).model, base.model);
    assert.equal(calls, 2);
    assert.equal(budget.snapshot().uncertain, 1);
    assert.equal(budget.snapshot().settled, 1);
    assert.equal(budget.snapshot().outstandingMicrodollars, 3_001_500);
  });
  assert.doesNotMatch(JSON.stringify(await events(path)), /private error detail/);
});

test("billing errors are sanitized and halt future submissions while retaining the full reserve", async t => {
  const path = await folder(t);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    error: { type: "invalid_request_error", message: "The credit balance is too low; private diagnostic" },
  }), { status: 400 }));
  await withLiveQaBudgetFixture(path, async budget => {
    const response = await post();
    assert.equal(response.status, 400);
    assert.doesNotMatch(await response.text(), /private diagnostic/);
    assert.equal(budget.snapshot().halted, true);
    assert.equal(budget.snapshot().outstandingMicrodollars, 3_001_500);
  });
  await withLiveQaBudgetFixture(path, async () => assert.rejects(post(), /accounting halt/));
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal((await events(path)).at(-1).category, "billing");
});

test("unexpected response pricing retains debt and an over-bound known usage settles but halts", async t => {
  const unexpected = await folder(t);
  const overage = await folder(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (request: Request) => {
    calls++;
    if (calls === 1) return success(base.model, { input_tokens: 111, output_tokens: 22, cache_creation_input_tokens: 1 });
    const body = await request.json();
    assert.equal(body.inference_geo, undefined);
    return success("claude-haiku-4-5-20251001", { input_tokens: 50, output_tokens: 101 });
  });
  await withLiveQaBudgetFixture(unexpected, async budget => {
    await assert.rejects(post(), /usage could not be settled/);
    assert.equal(budget.snapshot().outstandingMicrodollars, 3_001_500);
    assert.equal(budget.snapshot().halted, true);
  });
  await withLiveQaBudgetFixture(overage, async budget => {
    await assert.rejects(post({ ...base, model: "claude-haiku-4-5-20251001" }), /exceeded/);
    assert.equal(budget.snapshot().settledMicrodollars, 555);
    assert.equal(budget.snapshot().outstandingMicrodollars, 0);
    assert.equal(budget.snapshot().halted, true);
  });
});

test("documented standard speed and inclusive output details settle at the existing rates", async t => {
  const path = await folder(t);
  t.mock.method(globalThis, "fetch", async () => success(base.model, {
    input_tokens: 200, output_tokens: 40, speed: "standard", service_tier: "standard", inference_geo: "global",
    cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
    server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
    output_tokens_details: { thinking_tokens: 5, text_tokens: 35 },
  }));
  await withLiveQaBudgetFixture(path, async budget => {
    assert.equal((await post()).status, 200);
    assert.equal(budget.snapshot().settledMicrodollars, 1200);
    assert.equal(budget.snapshot().halted, false);
  });
});

test("a reviewed probe is one reservation and preserves the original halt and debt", async t => {
  const path = await folder(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1) return success(base.model, {
      input_tokens: 110, output_tokens: 21, speed: "fast", sk_private_credential: 123,
      server_tool_use: { web_search_requests: 7, unknown_tool: "private data" },
    });
    return success(base.model, { input_tokens: 111, output_tokens: 2, speed: "standard" });
  });
  await withLiveQaBudgetFixture(path, async budget => {
    await assert.rejects(post(), /usage could not be settled/);
    assert.equal(budget.snapshot().recoveryProbe, "none");
  });
  const entries = await events(path);
  const original = entries.at(-1);
  assert.equal(original.category, "invalid_usage");
  assert.deepEqual(original.usageDiagnostics, {
    fields: ["input_tokens", "output_tokens", "server_tool_use", "server_tool_use.unknown_tool", "server_tool_use.web_search_requests", "speed"],
    counters: { input_tokens: 110, output_tokens: 21, "server_tool_use.web_search_requests": 7 },
  });
  assert.doesNotMatch(JSON.stringify(entries), /private data|sk_private|fast/);
  await withLiveQaBudgetFixture(path, async () => assert.rejects(post(), /accounting halt/));
  await withLiveQaBudgetFixture(path, async budget => {
    assert.equal(budget.snapshot().recoveryProbe, "armed");
    await assert.rejects(post(), /probe payload does not match/);
    assert.equal((await post(probe)).status, 200);
    await assert.rejects(post(probe), /accounting halt/);
    const result = budget.snapshot();
    assert.equal(result.recoveryProbe, "used");
    assert.equal(result.halted, true);
    assert.equal(result.outstandingMicrodollars, 3_001_500);
    assert.equal(result.settledMicrodollars, 363);
  }, { recoveryFor: original.id });
  await assert.rejects(withLiveQaBudgetFixture(path, async () => assert.fail(), { recoveryFor: original.id }), /already used/);
  assert.equal(calls, 2);
  assert.deepEqual((await events(path)).slice(0, entries.length), entries);
});

test("a billing halt cannot be armed for a usage recovery probe", async t => {
  const path = await folder(t);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: { type: "billing_error" } }), { status: 400 }));
  await withLiveQaBudgetFixture(path, async () => { await post(); });
  const initial = await events(path);
  await assert.rejects(withLiveQaBudgetFixture(path, async () => assert.fail(), { recoveryFor: initial.at(-1).id }), /no qualifying unresolved attempt/);
  assert.deepEqual(await events(path), initial);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("reviewed continuation cites the one settled probe, keeps old debt and cannot waive a new halt", async t => {
  const path = await folder(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1) return success(base.model, { input_tokens: 110, output_tokens: 2, speed: "unexpected" });
    if (calls === 2 || calls === 3) return success(base.model, { input_tokens: 111, output_tokens: 2, speed: "standard" });
    return new Response(JSON.stringify({ error: { type: "billing_error" } }), { status: 400 });
  });
  await withLiveQaBudgetFixture(path, async () => assert.rejects(post(), /could not be settled/));
  const original = (await events(path)).at(-1);
  const wrong = { continuationFor: { priorId: original.id, probeId: original.id } };
  await assert.rejects(withLiveQaBudgetFixture(path, async () => assert.fail(), wrong), /no qualifying settled probe/);
  await withLiveQaBudgetFixture(path, async () => { await post(probe); }, { recoveryFor: original.id });
  const beforeReview = await events(path);
  const settlement = beforeReview.at(-1);
  const continuation = { continuationFor: { priorId: original.id, probeId: settlement.id } };
  await withLiveQaBudgetFixture(path, async () => assert.rejects(post(), /accounting halt/));
  await withLiveQaBudgetFixture(path, async budget => {
    assert.equal(budget.snapshot().reviewedContinuation, true);
    assert.equal(budget.snapshot().halted, false);
    assert.equal(budget.snapshot().outstandingMicrodollars, 3_001_500);
    assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 400);
    assert.equal(budget.snapshot().halted, true);
  }, continuation);
  await assert.rejects(withLiveQaBudgetFixture(path, async () => assert.fail(), continuation), /no qualifying settled probe/);
  await withLiveQaBudgetFixture(path, async budget => {
    assert.equal(budget.snapshot().halted, true);
    assert.equal(budget.snapshot().outstandingMicrodollars, 6_003_000);
    await assert.rejects(post(), /accounting halt/);
  });
  assert.equal(calls, 4);
  assert.deepEqual((await events(path)).slice(0, beforeReview.length), beforeReview);
});

test("the carrier hold is append-only, survives restart and lowers Anthropic admission headroom", async t => {
  const path = await folder(t);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Mock unknown outcome"); });
  const review = { reserveCarrierAllowance: true } as const;
  await withLiveQaBudgetFixture(path, async budget => {
    assert.equal(budget.snapshot().externalCarrierHoldMicrodollars, 1_000_000);
    assert.equal(budget.snapshot().committedMicrodollars, 1_000_000);
    assert.equal(fetchMock.mock.callCount(), 0);
  }, review);
  const baseline = await events(path);
  await withLiveQaBudgetFixture(path, async budget => {
    assert.equal(budget.snapshot().externalCarrierHoldMicrodollars, 1_000_000);
  }, review);
  assert.deepEqual(await events(path), baseline);
  await withLiveQaBudgetFixture(path, async budget => {
    await assert.rejects(post(), /transport/);
    await assert.rejects(post(), /transport/);
    await assert.rejects(post(), /spending cap/);
    assert.equal(budget.snapshot().outstandingMicrodollars, 6_003_000);
    assert.equal(budget.snapshot().committedMicrodollars, 7_003_000);
  });
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.deepEqual((await events(path)).slice(0, baseline.length), baseline);
});

test("an external carrier hold cannot exceed the same aggregate cap", async t => {
  const path = await folder(t);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Mock unknown outcome"); });
  await withLiveQaBudgetFixture(path, async budget => {
    for (let index = 0; index < 3; index++) await assert.rejects(post(), /transport/);
    assert.equal(budget.snapshot().committedMicrodollars, 9_004_500);
  });
  const baseline = await events(path);
  await assert.rejects(withLiveQaBudgetFixture(path, async () => assert.fail(), { reserveCarrierAllowance: true }), /aggregate spending cap/);
  assert.deepEqual(await events(path), baseline);
  assert.equal(fetchMock.mock.callCount(), 3);
});
