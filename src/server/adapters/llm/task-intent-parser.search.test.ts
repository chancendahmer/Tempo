import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import { AnthropicTaskIntentParser } from "./task-intent-parser";
import { withAiInvocationScope } from "../../domain/ai-invocation-scope";

const mocks = vi.hoisted(() => ({ create: vi.fn(), reserve: vi.fn(), claim: vi.fn(), settle: vi.fn(), uncertain: vi.fn(), construct: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {
  constructor(options: unknown) { mocks.construct(options); }
  baseURL = "https://api.anthropic.com";
  messages = { create: mocks.create };
} }));
vi.mock("../../db/repositories/ai-budget-repository", () => ({ DrizzleAiBudgetRepository: class {
  reserve = mocks.reserve; claim = mocks.claim; settle = mocks.settle; markUncertain = mocks.uncertain;
} }));
vi.mock("../../config/env", () => ({ getServerEnv: () => ({ LOG_LEVEL: "silent" }), requireEnv: () => ({
  ANTHROPIC_API_KEY: "synthetic-only", ANTHROPIC_MODEL: "claude-haiku-4-5-20251001", ASSISTANT_WEB_SEARCH_ENABLED: true,
  AI_BUDGET_MODE: "enforce", AI_BUDGET_PRICE_VERSION: "anthropic-standard-2026-10-22-v1",
  AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS: "100000000", AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS: "100000000",
  AI_BUDGET_GLOBAL_DAILY_CALLS: "20", AI_BUDGET_ACCOUNT_DAILY_CALLS: "20",
}) }));

const input = { message: "Search for current information", timezone: "UTC", now: new Date("2026-10-22T12:00:00Z"), openTasks: [], openGoals: [], memories: [] };
const search = (id: string) => ({ type: "server_tool_use", id, name: "web_search", input: { query: "synthetic current information" } });
const searchResult = (id: string) => ({ type: "web_search_tool_result", tool_use_id: id, content: [{ type: "web_search_result", url: "https://example.test/source", title: "Synthetic source", encrypted_content: "synthetic-preserved-content" }] });
const answer = { type: "text", text: "The current result.", citations: [{ type: "web_search_result_location", url: "https://example.test/source" }] };
function response(content: unknown[], stop_reason = "end_turn", searches = 0) {
  return { content, stop_reason, model: "claude-haiku-4-5-20251001", usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: searches, web_fetch_requests: 0 } } };
}
const parser = () => new AnthropicTaskIntentParser({ authorize: async () => ({ mode: "write", commands: ["grocery_add"] }) });
const run = (extra: Partial<Parameters<AnthropicTaskIntentParser["parse"]>[0]> = {}) => withAiInvocationScope({ accountId: randomUUID(), executionId: randomUUID() }, () => parser().parse({ ...input, ...extra }));

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(input.now);
  mocks.reserve.mockImplementation(async value => ({ allowed: true, attemptId: value.attemptId, replay: false }));
  mocks.claim.mockResolvedValue(true); mocks.settle.mockResolvedValue("settled");
});
afterEach(() => vi.useRealTimers());

it("resumes a deferred search with unchanged tools/content and settles both physical requests", async () => {
  const requests: MessageCreateParamsNonStreaming[] = [];
  const paused = response([search("srv-1")], "pause_turn");
  mocks.create.mockImplementation(async request => {
    requests.push(structuredClone(request));
    return requests.length === 1 ? paused : response([searchResult("srv-1"), answer], "end_turn", 1);
  });
  expect(await run()).toMatchObject({ kind: "conversation", reply: expect.stringContaining("https://example.test/source") });
  expect(requests).toHaveLength(2);
  expect(requests[1].tools).toEqual(requests[0].tools);
  expect(requests[1].messages.at(-1)).toEqual({ role: "assistant", content: paused.content });
  expect(mocks.reserve).toHaveBeenCalledTimes(2); expect(mocks.claim).toHaveBeenCalledTimes(2);
  expect(mocks.settle.mock.calls.map(([value]) => value.usage.webSearchRequests)).toEqual([0, 1]);
  expect(new Set(mocks.reserve.mock.calls.map(([value]) => value.attemptId)).size).toBe(2);
  expect(mocks.create.mock.calls.every(([, options]) => options.maxRetries === 0)).toBe(true);
  expect(mocks.construct).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
  expect(mocks.uncertain).not.toHaveBeenCalled();
});

it("retains the same definition for a mixed client/deferred-server turn", async () => {
  const requests: MessageCreateParamsNonStreaming[] = [];
  const message = "Search current information and list my tasks";
  mocks.create.mockImplementation(async request => {
    requests.push(structuredClone(request));
    return requests.length === 1
      ? response([search("srv-1"), { type: "tool_use", id: "local-1", name: "list_tasks", input: { sourceQuote: message } }], "tool_use")
      : response([searchResult("srv-1"), answer], "end_turn", 1);
  });
  const execute = vi.fn(async () => "No open tasks.");
  await run({ message, execute });
  expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "list_tasks", status: "open" });
  expect(requests[1].tools).toEqual(requests[0].tools);
  expect(requests[1].messages.at(-1)).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "local-1", content: "No open tasks." }] });
  expect(mocks.settle).toHaveBeenCalledTimes(2);
});

it("stops before a third request if another pending search exhausts the aggregate allowance", async () => {
  mocks.create.mockResolvedValueOnce(response([search("srv-1")], "pause_turn"))
    .mockResolvedValueOnce(response([searchResult("srv-1"), search("srv-2")], "pause_turn", 1));
  const result = await run();
  expect(result).toMatchObject({ kind: "conversation", reply: expect.stringContaining("couldn’t finish the live search") });
  expect(result).not.toHaveProperty("reply", expect.stringContaining("The current result"));
  expect(mocks.create).toHaveBeenCalledTimes(2); expect(mocks.reserve).toHaveBeenCalledTimes(2); expect(mocks.settle).toHaveBeenCalledTimes(2);
});

it("removes only completed search capacity before ordinary tool-result synthesis", async () => {
  const message = "Search current information and list my tasks and goals";
  const budgets: Array<number | undefined> = [];
  mocks.create.mockImplementation(async request => {
    budgets.push(request.tools.find((tool: { name: string }) => tool.name === "web_search")?.max_uses);
    if (budgets.length <= 2) return response([search(`srv-${budgets.length}`), searchResult(`srv-${budgets.length}`), {
      type: "tool_use", id: `local-${budgets.length}`, name: budgets.length === 1 ? "list_tasks" : "list_goals", input: { sourceQuote: message },
    }], "tool_use", 1);
    return response([answer]);
  });
  expect(await run({ message, execute: async () => "No saved items." })).toMatchObject({ reply: expect.stringContaining("https://example.test/source") });
  expect(budgets).toEqual([1, 1, undefined]);
  expect(mocks.settle.mock.calls.map(([value]) => value.usage.webSearchRequests)).toEqual([1, 1, 0]);
});

it("caps repeated pauses at six physical attempts without double-counting a pending ID", async () => {
  mocks.create.mockResolvedValue(response([search("same-pending-id")], "pause_turn"));
  expect(await run()).toMatchObject({ kind: "conversation", reply: expect.stringContaining("couldn’t finish the live search") });
  expect(mocks.create).toHaveBeenCalledTimes(6); expect(mocks.reserve).toHaveBeenCalledTimes(6); expect(mocks.settle).toHaveBeenCalledTimes(6);
});

it("uses authoritative usage to stop repeated IDs from granting fresh search capacity", async () => {
  mocks.create.mockResolvedValue(response([search("same-pending-id")], "pause_turn", 1));
  await run();
  expect(mocks.create).toHaveBeenCalledTimes(2); expect(mocks.settle.mock.calls.map(([value]) => value.usage.webSearchRequests)).toEqual([1, 1]);
});

it("retains the first settlement and denies a continuation at the accounting cap", async () => {
  mocks.create.mockResolvedValue(response([search("srv-1")], "pause_turn"));
  mocks.reserve.mockImplementationOnce(async value => ({ allowed: true, attemptId: value.attemptId, replay: false }))
    .mockResolvedValueOnce({ allowed: false, reason: "budget_exhausted" });
  await expect(run()).rejects.toMatchObject({ category: "budget" });
  expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.settle).toHaveBeenCalledTimes(1); expect(mocks.reserve).toHaveBeenCalledTimes(2);
});

it("keeps a completed write confirmation if the subsequent paused search is budget denied", async () => {
  const message = "Add milk to my groceries and search for current information";
  mocks.create.mockResolvedValueOnce(response([{ type: "tool_use", id: "write-1", name: "grocery_add", input: { items: ["Milk"], sourceQuote: message } }], "tool_use"))
    .mockResolvedValueOnce(response([search("srv-1")], "pause_turn"));
  mocks.reserve.mockImplementation(async value => mocks.reserve.mock.calls.length <= 2 ? { allowed: true, attemptId: value.attemptId, replay: false } : { allowed: false, reason: "budget_exhausted" });
  const execute = vi.fn(async () => "Added Milk.");
  expect(await run({ message, execute })).toEqual({ kind: "conversation", reply: "Added Milk." });
  expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "grocery_add", items: ["Milk"] });
  expect(mocks.create).toHaveBeenCalledTimes(2); expect(mocks.settle).toHaveBeenCalledTimes(2);
});

it("preserves a completed write and explicitly reports an exhausted incomplete search", async () => {
  const message = "Add milk to my groceries and search for current information";
  mocks.create.mockResolvedValueOnce(response([{ type: "tool_use", id: "write-1", name: "grocery_add", input: { items: ["Milk"], sourceQuote: message } }], "tool_use"))
    .mockResolvedValueOnce(response([search("srv-1")], "pause_turn"))
    .mockResolvedValueOnce(response([searchResult("srv-1"), search("srv-2")], "pause_turn", 1));
  const result = await run({ message, execute: async () => "Added Milk." });
  expect(result).toMatchObject({ reply: expect.stringContaining("Added Milk.\nI couldn’t finish the live search") });
  expect(mocks.create).toHaveBeenCalledTimes(3); expect(mocks.settle).toHaveBeenCalledTimes(3);
});

it("permits one fresh search-unavailable fallback only before a server turn is pending", async () => {
  const requests: MessageCreateParamsNonStreaming[] = [];
  mocks.create.mockImplementation(async request => {
    requests.push(structuredClone(request));
    if (requests.length === 1) throw { status: 400, message: "web_search is unavailable" };
    return response([{ type: "text", text: "Live search is unavailable. Here is general guidance." }]);
  });
  expect(await run()).toMatchObject({ reply: expect.stringContaining("Live search is unavailable") });
  expect(requests[1].tools?.some(tool => tool.name === "web_search")).toBe(false);
  expect(mocks.reserve).toHaveBeenCalledTimes(2); expect(mocks.settle).toHaveBeenCalledTimes(1); expect(mocks.uncertain).toHaveBeenCalledOnce();
});

it("does not strip a pending tool and retry after a continuation validation failure", async () => {
  mocks.create.mockResolvedValueOnce(response([search("srv-1")], "pause_turn"))
    .mockRejectedValueOnce({ status: 400, message: "web_search pending call failed validation" });
  await expect(run()).rejects.toMatchObject({ category: "transient", status: 400 });
  expect(mocks.create).toHaveBeenCalledTimes(2); expect(mocks.reserve).toHaveBeenCalledTimes(2); expect(mocks.settle).toHaveBeenCalledTimes(1);
  expect(mocks.uncertain).toHaveBeenCalledWith(expect.any(String), "provider_error");
});
