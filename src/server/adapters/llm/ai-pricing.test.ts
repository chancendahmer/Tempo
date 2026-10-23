import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import { describe, expect, it } from "vitest";
import { AI_PRICE_VERSION, buildAdmissionEnvelope, priceUsage } from "./ai-pricing";

const now = new Date("2026-10-22T12:00:00Z");
const config = { AI_BUDGET_PRICE_VERSION: AI_PRICE_VERSION, AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS: "10000000", AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS: "5000000", AI_BUDGET_GLOBAL_DAILY_CALLS: "500", AI_BUDGET_ACCOUNT_DAILY_CALLS: "30" };
const request = (extra: Record<string, unknown> = {}) => ({ model: "claude-haiku-4-5-20251001", messages: [{ role: "user", content: "Synthetic fixture" }], max_tokens: 1400, ...extra }) as MessageCreateParamsNonStreaming;
const baseUsage = { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: null, server_tool_use: null, service_tier: "standard", inference_geo: null, output_tokens_details: null };
const search = [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }];

describe("verified AI price contract with synthetic usage", () => {
  it("reserves a whole supported context at the worst cache rate, not a text heuristic", () => {
    const envelope = buildAdmissionEnvelope(request(), now, config);
    expect(envelope).toMatchObject({ inputBound: 200000, outputBound: 1400, searchBound: 0, reservedMicrodollars: 407000 });
    expect(buildAdmissionEnvelope(request({ messages: [{ role: "user", content: "🙂漢字".repeat(50000) }] }), now, config).reservedMicrodollars).toBe(envelope.reservedMicrodollars);
    expect(buildAdmissionEnvelope(request({ model: "claude-sonnet-4-5-20250929" }), now, config).reservedMicrodollars).toBe(1221000);
  });
  it("reserves ten server iterations as well as search fees; every continuation gets its own envelope", () => {
    const envelope = buildAdmissionEnvelope(request({ tools: search }), now, config);
    expect(envelope).toMatchObject({ inputBound: 2000000, outputBound: 14000, searchBound: 2, reservedMicrodollars: 4090000 });
    expect(priceUsage(envelope, { ...baseUsage, server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 } }, envelope.model)).toMatchObject({ actualMicrodollars: 20150, haltAdmission: false });
  });
  it("prices every distinct cache bucket once with a single upward microdollar rounding", () => {
    const envelope = buildAdmissionEnvelope(request(), now, config);
    const result = priceUsage(envelope, { ...baseUsage, input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 1, cache_creation: { ephemeral_5m_input_tokens: 1, ephemeral_1h_input_tokens: 1 }, output_tokens_details: { thinking_tokens: 1 } }, envelope.model);
    expect(result.actualMicrodollars).toBe(10); // 1 + 5 + 1.25 + 2 + .1 = 9.35.
    const sonnet = buildAdmissionEnvelope(request({ model: "claude-sonnet-4-5-20250929" }), now, config);
    expect(priceUsage(sonnet, { ...baseUsage, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1 }, sonnet.model).actualMicrodollars).toBe(1);
  });
  it("allows supported cache controls but rejects unknown charges/options before network", () => {
    expect(buildAdmissionEnvelope(request({ system: [{ type: "text", text: "synthetic", cache_control: { type: "ephemeral", ttl: "1h" } }] }), now, config)).toBeTruthy();
    for (const extra of [{ model: "claude-haiku-4-5" }, { model: "new-model" }, { thinking: { type: "enabled", budget_tokens: 1000 } }, { stream: true }, { service_tier: "auto" }, { inference_geo: "us" }, { tools: [{ type: "web_fetch_20250910", name: "web_fetch" }] }, { tools: [{ ...search[0], max_uses: 3 }] }, { tools: [{ ...search[0], max_uses: undefined }] }, { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }] }, { tools: [...search, ...search] }, { system: [{ type: "text", text: "x", cache_control: { type: "ephemeral", ttl: "24h" } }] }]) {
      expect(() => buildAdmissionEnvelope(request(extra), now, config)).toThrow();
    }
    expect(() => buildAdmissionEnvelope(request({ messages: [{ role: "user", content: [{ type: "image", source: {} }] }] }), now, config)).toThrow();
  });
  it("keeps arbitrary tool argument data inert but restricts billable content block envelopes", () => {
    const messages = [{ role: "assistant", content: [{ type: "tool_use", id: "tool1", name: "save_note", input: { thinking: "not a request option", cache_control: "inert data" } }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "tool1", content: "Saved" }] }];
    expect(buildAdmissionEnvelope(request({ messages }), now, config)).toBeTruthy();
    expect(() => buildAdmissionEnvelope(request({ messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: [{ type: "document" }] }] }] }), now, config)).toThrow();
  });
  it("rejects unreviewed/expired policy, malformed caps and unsafe integers", () => {
    for (const invalid of [undefined, "", "-1", "1.1", "Infinity", "1e4", "9007199254740992"]) expect(() => buildAdmissionEnvelope(request(), now, { ...config, AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS: invalid })).toThrow();
    for (const date of [new Date("invalid"), new Date("2026-10-21"), new Date("2026-11-22")]) expect(() => buildAdmissionEnvelope(request(), date, config)).toThrow();
    expect(() => buildAdmissionEnvelope(request(), now, { ...config, AI_BUDGET_PRICE_VERSION: "unknown" })).toThrow();
    expect(buildAdmissionEnvelope(request(), now, { ...config, AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS: "0" }).policy.globalDailyMicrodollars).toBe(0);
  });
  it("rejects unknown/missing/negative/noninteger/mismatched usage without guessing a refund", () => {
    const envelope = buildAdmissionEnvelope(request(), now, config);
    for (const extra of [{ input_tokens: undefined }, { output_tokens: -1 }, { output_tokens: 0.1 }, { input_tokens: Number.MAX_SAFE_INTEGER + 1 }, { new_billable_field: 1 }, { cache_creation_input_tokens: 1 }, { cache_creation_input_tokens: 1, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } }, { server_tool_use: { web_search_requests: 0, web_fetch_requests: 1 } }, { service_tier: "priority" }, { inference_geo: "us" }]) expect(() => priceUsage(envelope, { ...baseUsage, ...extra }, envelope.model)).toThrow();
    expect(() => priceUsage(envelope, { input_tokens: 1, output_tokens: 1 }, envelope.model)).toThrow();
    expect(() => priceUsage(envelope, baseUsage, "unpriced-model")).toThrow();
    expect(() => priceUsage(buildAdmissionEnvelope(request({ tools: search }), now, config), baseUsage, envelope.model)).toThrow();
  });
  it("records priceable overages without clamping, flags even cheaper component violations", () => {
    const envelope = buildAdmissionEnvelope(request(), now, config);
    const result = priceUsage(envelope, { ...baseUsage, output_tokens: 100000 }, envelope.model);
    expect(result.actualMicrodollars).toBe(500100);
    expect(result.haltAdmission).toBe(true);
    const cheapViolation = priceUsage(envelope, { ...baseUsage, input_tokens: 200001, output_tokens: 0 }, envelope.model);
    expect(cheapViolation.actualMicrodollars).toBeLessThan(envelope.reservedMicrodollars);
    expect(cheapViolation.haltAdmission).toBe(true);
    expect(() => priceUsage(envelope, { ...baseUsage, output_tokens: Number.MAX_SAFE_INTEGER }, envelope.model)).toThrow();
  });
  it("versions cap changes without storing raw configuration in a model prompt", () => {
    const first = buildAdmissionEnvelope(request(), now, config);
    expect(first.policyVersion).toBe(buildAdmissionEnvelope(request(), now, config).policyVersion);
    expect(first.policyVersion).not.toBe(buildAdmissionEnvelope(request(), now, { ...config, AI_BUDGET_ACCOUNT_DAILY_CALLS: "31" }).policyVersion);
  });
});
