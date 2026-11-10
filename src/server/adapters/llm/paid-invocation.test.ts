import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { withAiInvocationScope } from "../../domain/ai-invocation-scope";
import { AI_PRICE_VERSION, SONNET_46_MODEL, buildAdmissionEnvelope, priceUsage } from "./ai-pricing";
import { AiBudgetDeniedError, invokePaidMessage, meteredMessage, type PaidInvocationDependencies } from "./paid-invocation";

const settings = vi.hoisted(() => ({ mode: "off" }));
vi.mock("../../config/env", () => ({ requireEnv: () => ({ AI_BUDGET_MODE: settings.mode }) }));

const request = { model: "synthetic-model", max_tokens: 10, messages: [{ role: "user" as const, content: "private synthetic text" }] };
const usage = { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, cacheCreation5mInputTokens: 0, cacheCreation1hInputTokens: 0, webSearchRequests: 0 };
function fixture() {
  const create = vi.fn().mockResolvedValue({ model: request.model, usage: { input_tokens: 1, output_tokens: 1 }, content: [] });
  const repository = { reserve: vi.fn().mockImplementation(async input => ({ allowed: true, attemptId: input.attemptId, replay: false })), claim: vi.fn().mockResolvedValue(true), markUncertain: vi.fn(), settle: vi.fn().mockResolvedValue("settled"), reconcile: vi.fn() };
  const dependencies: PaidInvocationDependencies = { enabled: true, repository,
    admit: vi.fn(() => ({ model: request.model, priceVersion: "synthetic-v1", policyVersion: "synthetic-v1", reservedMicrodollars: 10, policy: { globalDailyMicrodollars: 100, accountDailyMicrodollars: 100, globalDailyCalls: 10, accountDailyCalls: 10 } })),
    price: vi.fn(() => ({ actualMicrodollars: 2, usage })),
  };
  const client = { messages: { create } } as unknown as Anthropic;
  const run = () => withAiInvocationScope({ accountId: randomUUID(), executionId: randomUUID() }, () => meteredMessage(client, request, "assistant", dependencies));
  return { create, repository, dependencies, client, run };
}

it("keeps off mode compatible with existing responses and SDK request options", async () => {
  const f = fixture(); f.dependencies.enabled = false;
  await meteredMessage(f.client, request, "assistant", f.dependencies);
  expect(f.create).toHaveBeenCalledExactlyOnceWith(request);
  expect(f.repository.reserve).not.toHaveBeenCalled();
});

it("denies malformed enforcement modes and absent trusted scope without a paid call", async () => {
  const f = fixture();
  for (const mode of ["invalid", "enforce"]) {
    settings.mode = mode;
    await expect(invokePaidMessage(f.client, request, "assistant")).rejects.toBeInstanceOf(AiBudgetDeniedError);
  }
  settings.mode = "off";
  await invokePaidMessage(f.client, request, "assistant");
  expect(f.create).toHaveBeenCalledExactlyOnceWith(request);
});

it("reserves and claims each physical call with isolated metadata and disables SDK retry", async () => {
  const f = fixture(); await f.run(); await f.run();
  expect(f.repository.reserve).toHaveBeenCalledTimes(2);
  expect(f.repository.reserve.mock.calls[0][0].attemptId).not.toBe(f.repository.reserve.mock.calls[1][0].attemptId);
  expect(JSON.stringify(f.repository.reserve.mock.calls)).not.toContain("private synthetic text");
  expect(f.create).toHaveBeenCalledWith({ ...request, service_tier: "standard_only" }, { maxRetries: 0, signal: undefined });
  expect(f.repository.settle).toHaveBeenCalledTimes(2);
});

it("pins global Sonnet 4.6 routing and settles a standard Messages response", async () => {
  const f = fixture();
  const sonnetRequest = { ...request, model: SONNET_46_MODEL, max_tokens: 1400 };
  const providerResponse = { model: SONNET_46_MODEL, content: [], usage: {
    input_tokens: 200, output_tokens: 40, speed: "standard", service_tier: "standard", inference_geo: "global",
    cache_creation_input_tokens: 2, cache_read_input_tokens: 1,
    cache_creation: { ephemeral_5m_input_tokens: 1, ephemeral_1h_input_tokens: 1 },
    output_tokens_details: { text_tokens: 35, thinking_tokens: 5 },
    server_tool_use: null,
  } };
  f.create.mockResolvedValue(providerResponse);
  const config = { AI_BUDGET_PRICE_VERSION: AI_PRICE_VERSION, AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS: "10000000",
    AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS: "10000000", AI_BUDGET_GLOBAL_DAILY_CALLS: "10", AI_BUDGET_ACCOUNT_DAILY_CALLS: "10" };
  const run = (requested = sonnetRequest) => withAiInvocationScope({ accountId: randomUUID(), executionId: randomUUID() }, () =>
    meteredMessage(f.client, requested, "assistant", {
      enabled: true, repository: f.repository,
      admit: value => buildAdmissionEnvelope(value, new Date("2026-11-10T12:00:00Z"), config),
      price: priceUsage,
    }));
  await expect(run()).resolves.toEqual(providerResponse);
  expect(f.create).toHaveBeenCalledExactlyOnceWith({ ...sonnetRequest, service_tier: "standard_only", inference_geo: "global" }, { maxRetries: 0, signal: undefined });
  expect(f.repository.reserve).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ model: SONNET_46_MODEL, reservedMicrodollars: 6021000, priceVersion: AI_PRICE_VERSION }));
  expect(f.repository.settle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ actualMicrodollars: 1211, haltAdmission: false }));
  expect(f.repository.markUncertain).not.toHaveBeenCalled();
  const usRequest = { ...sonnetRequest, inference_geo: "us" };
  await expect(run(usRequest)).rejects.toBeInstanceOf(AiBudgetDeniedError);
  expect(f.create).toHaveBeenCalledTimes(1);
});
it("rejects an unpriced SDK provider override before accounting or network", async () => {
  const f = fixture(); settings.mode = "enforce";
  await expect(withAiInvocationScope({ accountId: randomUUID(), executionId: randomUUID() }, () => invokePaidMessage(Object.assign(f.client, { baseURL: "https://unpriced.example" }), request, "assistant"))).rejects.toBeInstanceOf(AiBudgetDeniedError);
  expect(f.create).not.toHaveBeenCalled();
  expect(f.repository.reserve).not.toHaveBeenCalled();
  settings.mode = "off";
});

it("sends the admitted snapshot if the caller mutates its request during reservation", async () => {
  const f = fixture(); const mutableRequest = structuredClone(request);
  f.repository.reserve.mockImplementation(async input => {
    mutableRequest.max_tokens = 1000;
    return { allowed: true, attemptId: input.attemptId, replay: false };
  });
  await withAiInvocationScope({ accountId: randomUUID(), executionId: randomUUID() }, () => meteredMessage(f.client, mutableRequest, "assistant", f.dependencies));
  expect(f.create.mock.calls[0][0].max_tokens).toBe(10);
});

it.each(["missing_scope", "invalid_request", "budget", "database", "claimed"])("denies %s before any network request", async reason => {
  const f = fixture();
  if (reason === "invalid_request") f.dependencies.admit = () => { throw new Error("secret configuration"); };
  if (reason === "budget") f.repository.reserve.mockResolvedValue({ allowed: false, reason: "budget_exhausted" });
  if (reason === "database") f.repository.reserve.mockRejectedValue(new Error("secret database location"));
  if (reason === "claimed") f.repository.claim.mockResolvedValue(false);
  await expect(reason === "missing_scope" ? meteredMessage(f.client, request, "assistant", f.dependencies) : f.run()).rejects.toBeInstanceOf(AiBudgetDeniedError);
  expect(f.create).not.toHaveBeenCalled();
});

it.each(["APIConnectionTimeoutError", "APIConnectionError", "AbortError"])("retains uncertain submission debt after %s", async name => {
  const f = fixture(); const failure = Object.assign(new Error("private provider text"), { name }); f.create.mockRejectedValue(failure);
  await expect(f.run()).rejects.toBe(failure);
  expect(f.repository.markUncertain).toHaveBeenCalledWith(expect.any(String), name === "APIConnectionTimeoutError" ? "timeout" : "provider_error");
  expect(f.repository.settle).not.toHaveBeenCalled();
});

it("retains debt on invalid usage and settlement outage", async () => {
  const f = fixture(); f.dependencies.price = () => { throw new Error("invalid usage"); };
  await expect(f.run()).rejects.toBeInstanceOf(AiBudgetDeniedError);
  expect(f.repository.markUncertain).toHaveBeenCalledWith(expect.any(String), "invalid_usage");
  f.dependencies.price = () => ({ actualMicrodollars: 2, usage }); f.repository.settle.mockRejectedValue(new Error("offline"));
  await expect(f.run()).rejects.toBeInstanceOf(AiBudgetDeniedError);
});

it("forwards a priced envelope violation to atomic settlement for halting admission", async () => {
  const f = fixture(); f.dependencies.price = () => ({ actualMicrodollars: 2, usage, haltAdmission: true });
  await f.run();
  expect(f.repository.settle).toHaveBeenCalledWith(expect.objectContaining({ actualMicrodollars: 2, haltAdmission: true }));
});

it("keeps production model and hosted-search calls behind this boundary", () => {
  const directory = new URL("../../", import.meta.url);
  const direct = readdirSync(directory, { recursive: true }).map(String)
    // Twilio's messages.create is SMS delivery, outside the AI ledger.
    .filter(name => name.replaceAll("\\", "/") !== "adapters/sms/twilio-transport.ts")
    .filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith("paid-invocation.ts"))
    .filter(name => {
      const normalized = name.replaceAll("\\", "/");
      const source = readFileSync(new URL(normalized, directory), "utf8");
      if (/\.messages\.create\s*\(|count_tokens/.test(source)) return true;
      // Operational attestation compares the official host as data; it never
      // constructs a client or sends a request. Keep that exception narrow.
      if (normalized === "observability/ai-budget-attestation.ts") {
        expect(source).not.toMatch(/\bfetch\s*\(|\bnew\s+Anthropic\s*\(/);
        return false;
      }
      return /api\.anthropic\.com/.test(source);
    });
  expect(direct).toEqual([]);
});

it("passes a bounded search signal and disables retries even in off mode", async () => {
  settings.mode = "off";
  const f = fixture(), controller = new AbortController();
  await invokePaidMessage(f.client, request, "assistant", controller.signal);
  expect(f.create).toHaveBeenCalledExactlyOnceWith(request, { signal: controller.signal, maxRetries: 0 });
});
