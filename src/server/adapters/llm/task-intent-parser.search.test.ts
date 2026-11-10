import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import { AnthropicTaskIntentParser } from "./task-intent-parser";
import { withAiInvocationScope } from "../../domain/ai-invocation-scope";
import { AI_PRICE_VERSION, HOSTED_SEARCH_MODEL, SONNET_46_MODEL } from "./ai-pricing";

const mocks = vi.hoisted(() => ({ create: vi.fn(), reserve: vi.fn(), claim: vi.fn(), settle: vi.fn(), uncertain: vi.fn(), enabled: true }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {
  baseURL = "https://api.anthropic.com";
  messages = { create: mocks.create };
} }));
vi.mock("../../db/repositories/ai-budget-repository", () => ({ DrizzleAiBudgetRepository: class {
  reserve = mocks.reserve; claim = mocks.claim; settle = mocks.settle; markUncertain = mocks.uncertain;
} }));
vi.mock("../../config/env", () => ({ getServerEnv: () => ({ LOG_LEVEL: "silent" }), requireEnv: () => ({
  ANTHROPIC_API_KEY: "synthetic-only", ANTHROPIC_MODEL: SONNET_46_MODEL, ASSISTANT_WEB_SEARCH_ENABLED: mocks.enabled,
  AI_BUDGET_MODE: "enforce", AI_BUDGET_PRICE_VERSION: AI_PRICE_VERSION,
  AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS: "20000000", AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS: "10000000",
  AI_BUDGET_GLOBAL_DAILY_CALLS: "20", AI_BUDGET_ACCOUNT_DAILY_CALLS: "20",
}) }));

const input = { message: "Search for current information", timezone: "UTC", now: new Date("2026-11-10T12:00:00Z"), openTasks: [], openGoals: [], memories: [] };
const url = "https://example.test/source";
const lookup = (message = input.message, query = "current information", sourceQuote = message) => ({
  type: "tool_use", id: "lookup", name: "web_search", input: { query, sourceQuote },
});
const search = (id: string) => ({ type: "server_tool_use", id, name: "web_search", input: { query: "current information" } });
const searchResult = (id: string) => ({ type: "web_search_tool_result", tool_use_id: id, content: [
  { type: "web_search_result", url, title: "Synthetic source", encrypted_content: "preserved-in-search-only" },
] });
const answer = { type: "text", text: "The current result.", citations: [{ type: "web_search_result_location", url }] };
function response(model: string, content: unknown[], stop_reason = "end_turn", searches = 0) {
  return { content, stop_reason, model, usage: {
    input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
    server_tool_use: model === HOSTED_SEARCH_MODEL ? { web_search_requests: searches, web_fetch_requests: 0 } : null,
    service_tier: "standard", speed: "standard", inference_geo: model === SONNET_46_MODEL ? "global" : "not_available",
  } };
}
const main = (content: unknown[]) => response(SONNET_46_MODEL, content);
const hosted = (content: unknown[], stop = "end_turn", searches = 1) => response(HOSTED_SEARCH_MODEL, content, stop, searches);
const run = (extra: Partial<Parameters<AnthropicTaskIntentParser["parse"]>[0]> = {}) => withAiInvocationScope(
  { accountId: randomUUID(), executionId: randomUUID() },
  () => new AnthropicTaskIntentParser({ authorize: async () => ({ mode: "write", commands: ["grocery_add", "life_patch"] }) }).parse({ ...input, ...extra }),
);

beforeEach(() => {
  vi.resetAllMocks(); mocks.enabled = true; vi.useFakeTimers(); vi.setSystemTime(input.now);
  mocks.reserve.mockImplementation(async value => ({ allowed: true, attemptId: value.attemptId, replay: false }));
  mocks.claim.mockResolvedValue(true); mocks.settle.mockResolvedValue("settled");
});
afterEach(() => vi.useRealTimers());

it("keeps ordinary account reads on Sonnet without a hosted-search reservation", async () => {
  const message = "What is my day like?";
  mocks.create.mockResolvedValueOnce(main([{ type: "tool_use", id: "read", name: "list_tasks", input: { sourceQuote: message } }]))
    .mockResolvedValueOnce(main([{ type: "text", text: "No open tasks." }]));
  const execute = vi.fn(async () => "No open tasks.");
  await expect(run({ message, execute })).resolves.toMatchObject({ reply: "No open tasks." });
  expect(execute).toHaveBeenCalledOnce();
  expect(mocks.reserve.mock.calls.map(([value]) => value.reservedMicrodollars)).toEqual([6021000, 6021000]);
  expect(mocks.create.mock.calls.every(([request]) => request.model === SONNET_46_MODEL
    && !request.tools.some((tool: { type?: string }) => tool.type?.startsWith("web_search_")))).toBe(true);
});

it("meters main, isolated search and synthesis separately, preserving citations and private context boundaries", async () => {
  const requests: MessageCreateParamsNonStreaming[] = [];
  mocks.create.mockImplementation(async request => {
    requests.push(structuredClone(request));
    return requests.length === 1 ? main([lookup()]) : requests.length === 2
      ? hosted([search("srv-1"), searchResult("srv-1"), answer]) : main([{ type: "text", text: "The current result." }]);
  });
  expect(await run({ memories: ["PRIVATE memory marker"], customInstructions: "PRIVATE calendar marker" })).toMatchObject({ reply: expect.stringContaining(url) });
  expect(requests.map(request => request.model)).toEqual([SONNET_46_MODEL, HOSTED_SEARCH_MODEL, SONNET_46_MODEL]);
  expect(requests[1].messages).toEqual([{ role: "user", content: "current information" }]);
  expect(JSON.stringify(requests[1])).not.toContain("PRIVATE");
  expect(JSON.stringify(requests[2])).not.toContain("preserved-in-search-only");
  expect(requests[0].tools?.find(tool => tool.name === "web_search")).toMatchObject({ input_schema: { properties: { sourceQuote: { enum: [input.message] } } } });
  expect(mocks.reserve.mock.calls.map(([value]) => value.reservedMicrodollars)).toEqual([6021000, 4080000, 6021000]);
  expect(mocks.settle).toHaveBeenCalledTimes(3);
  expect(mocks.uncertain).not.toHaveBeenCalled();
});

it("resumes a deferred Haiku search with its exact blocks and hosted definition", async () => {
  const requests: MessageCreateParamsNonStreaming[] = [];
  const paused = hosted([search("srv-1")], "pause_turn", 0);
  mocks.create.mockImplementation(async request => {
    requests.push(structuredClone(request));
    return requests.length === 1 ? main([lookup()]) : requests.length === 2 ? paused
      : requests.length === 3 ? hosted([searchResult("srv-1"), answer]) : main([{ type: "text", text: "Current result." }]);
  });
  await run();
  expect(requests[2].tools).toEqual(requests[1].tools);
  expect(requests[2].messages.at(-1)).toEqual({ role: "assistant", content: paused.content });
  expect(mocks.settle.mock.calls.map(([value]) => value.usage.webSearchRequests)).toEqual([0, 0, 1, 0]);
  expect(mocks.create.mock.calls.every(([, options]) => options.maxRetries === 0)).toBe(true);
});

it("blocks unoffered search and mismatched or malformed public queries before an external lookup", async () => {
  for (const scenario of ["disabled", "mismatched", "oversized"] as const) {
    mocks.create.mockClear(); mocks.reserve.mockClear();
    mocks.enabled = scenario !== "disabled";
    mocks.create.mockResolvedValue(main([lookup(input.message, scenario === "oversized" ? "x".repeat(401) : "current information",
      scenario === "mismatched" ? "private background quote" : input.message)]));
    await run();
    expect(mocks.create.mock.calls.every(([request]) => request.model === SONNET_46_MODEL)).toBe(true);
  }
});

it("keeps quote repair limited to the same read before searching", async () => {
  const rejected = vi.fn();
  mocks.create.mockResolvedValueOnce(main([lookup(input.message, "current information", "wrong quote")]))
    .mockResolvedValueOnce(main([lookup()]))
    .mockResolvedValueOnce(hosted([search("srv-1"), searchResult("srv-1"), answer]))
    .mockResolvedValueOnce(main([{ type: "text", text: "Current result." }]));
  await run({ onToolRejection: rejected });
  expect(rejected).toHaveBeenCalledExactlyOnceWith({ reason: "source_quote_mismatch", iteration: 1, repairRequested: true });
  expect(mocks.create.mock.calls.map(([request]) => request.model)).toEqual([SONNET_46_MODEL, SONNET_46_MODEL, HOSTED_SEARCH_MODEL, SONNET_46_MODEL]);
});

it("never sends a query synthesized from private account context", async () => {
  mocks.create.mockResolvedValue(main([lookup(input.message, "PRIVATE client meeting on November 11")]));
  expect(await run({ memories: ["PRIVATE client meeting on November 11"] })).toMatchObject({
    reply: expect.stringContaining("What public phrase would you like me to search?"),
  });
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.reserve).toHaveBeenCalledOnce();
});

it("preserves the completed write in the reply alongside the isolated lookup", async () => {
  const message = "Add milk to my groceries and search for current information";
  mocks.create.mockResolvedValueOnce(main([{ type: "tool_use", id: "write", name: "grocery_add", input: { items: ["Milk"], sourceQuote: message } }]))
    .mockResolvedValueOnce(main([lookup(message)]))
    .mockResolvedValueOnce(hosted([search("srv-1"), searchResult("srv-1"), answer]))
    .mockResolvedValueOnce(main([{ type: "text", text: "Current result." }]));
  const execute = vi.fn(async () => "Added Milk.");
  expect(await run({ message, execute })).toMatchObject({ reply: expect.stringContaining("Added Milk.\nCurrent result.") });
  expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "grocery_add", items: ["Milk"] });
});

it("retains a freshly read record version across the isolated lookup for an authorized edit", async () => {
  const message = "Set my daily protein target to 90 grams and search for current information";
  const id = "00000000-0000-4000-8000-000000000093";
  const patch = { kind: "nutrition_target", protein: 90 };
  mocks.create.mockResolvedValueOnce(main([{ type: "tool_use", id: "read", name: "life_list", input: { kind: "nutrition_target", sourceQuote: message } }]))
    .mockResolvedValueOnce(main([lookup(message)]))
    .mockResolvedValueOnce(hosted([search("srv-1"), searchResult("srv-1"), answer]))
    .mockResolvedValueOnce(main([{ type: "tool_use", id: "patch", name: "life_patch", input: { id, version: 3, patch, sourceQuote: message } }]))
    .mockResolvedValueOnce(main([{ type: "text", text: "Current result." }]));
  const execute = vi.fn(async (command: { type: string }) => command.type === "life_list"
    ? JSON.stringify({ items: [{ id, version: 3 }] }) : "Saved your protein target.");
  expect(await run({ message, execute })).toMatchObject({ reply: expect.stringContaining("Saved your protein target.") });
  expect(execute.mock.calls.map(([command]) => command)).toEqual([
    { type: "life_list", kind: "nutrition_target" },
    { type: "life_patch", id, version: 3, patch },
  ]);
});

it("preserves a completed write and explicitly reports a denied search", async () => {
  const message = "Add milk to my groceries and search for current information";
  mocks.create.mockResolvedValueOnce(main([{ type: "tool_use", id: "write", name: "grocery_add", input: { items: ["Milk"], sourceQuote: message } }]))
    .mockResolvedValueOnce(main([lookup(message)]));
  mocks.reserve.mockImplementation(async value => value.model === HOSTED_SEARCH_MODEL
    ? { allowed: false, reason: "budget_exhausted" } : { allowed: true, attemptId: value.attemptId, replay: false });
  const execute = vi.fn(async () => "Added Milk.");
  expect(await run({ message, execute })).toMatchObject({ reply: expect.stringContaining("Added Milk.\nI couldn’t verify current information") });
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(execute).toHaveBeenCalledOnce();
});

it("retains verified source links if final synthesis is budget denied", async () => {
  mocks.create.mockResolvedValueOnce(main([lookup()]))
    .mockResolvedValueOnce(hosted([search("srv-1"), searchResult("srv-1"), answer]));
  mocks.reserve.mockImplementation(async value => mocks.reserve.mock.calls.length < 3
    ? { allowed: true, attemptId: value.attemptId, replay: false } : { allowed: false, reason: "budget_exhausted" });
  const result = await run();
  expect(result).toMatchObject({ reply: expect.stringContaining("couldn’t finish the summary.") });
  expect(result).toMatchObject({ reply: expect.stringContaining(url) });
  expect(mocks.create).toHaveBeenCalledTimes(2);
});
