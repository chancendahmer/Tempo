import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnthropicWebSearchSession } from "./anthropic-web-search";
import { HOSTED_SEARCH_MODEL } from "./ai-pricing";
import { invokePaidMessage } from "./paid-invocation";

vi.mock("./paid-invocation", () => ({ invokePaidMessage: vi.fn() }));
vi.mock("../../config/env", () => ({ getServerEnv: () => ({ LOG_LEVEL: "silent" }) }));
const invoke = vi.mocked(invokePaidMessage);
const client = {} as Anthropic;
const url = "https://example.test/source";
const pending = (id = "srv-1") => ({ type: "server_tool_use", id, name: "web_search", input: { query: "public query" } });
const result = (id = "srv-1", source = url) => ({ type: "web_search_tool_result", tool_use_id: id, content: [
  { type: "web_search_result", url: source, title: "Public result", encrypted_content: "private-provider-envelope" },
] });
const answer = (source = url) => ({ type: "text", text: "Public summary.", citations: [{ type: "web_search_result_location", url: source }] });
const response = (content: unknown[], stop_reason = "end_turn", searches = 1) => ({
  content, stop_reason, usage: { server_tool_use: { web_search_requests: searches } },
}) as Awaited<ReturnType<typeof invokePaidMessage>>;

beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-10T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

it("bounds all query attempts together and never forwards account context or writes", async () => {
  invoke.mockResolvedValue(response([pending(), result(), answer()]));
  const session = new AnthropicWebSearchSession(client);
  expect(await session.search("public query")).toEqual({ status: "complete", text: "Public summary.", sources: [url], truncated: false });
  expect(await session.search("second public query")).toMatchObject({ status: "complete" });
  expect(await session.search("third public query")).toMatchObject({ status: "limit" });
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke.mock.calls[0]).toEqual([client, expect.objectContaining({
    model: HOSTED_SEARCH_MODEL, messages: [{ role: "user", content: "public query" }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
  }), "assistant", expect.any(AbortSignal)]);
});

it("preserves exact pending search context and never exceeds six physical requests", async () => {
  invoke.mockResolvedValue(response([pending()], "pause_turn", 0));
  const session = new AnthropicWebSearchSession(client);
  expect(await session.search("public query")).toMatchObject({ status: "limit" });
  expect(invoke).toHaveBeenCalledTimes(6);
  expect(invoke.mock.calls[5][1].tools).toEqual(invoke.mock.calls[0][1].tools);
  expect(await session.search("another query")).toMatchObject({ status: "limit" });
  expect(invoke).toHaveBeenCalledTimes(6);
});

it("counts authoritative usage even when pending IDs repeat", async () => {
  invoke.mockResolvedValue(response([pending()], "pause_turn", 1));
  expect(await new AnthropicWebSearchSession(client).search("public query")).toMatchObject({ status: "limit" });
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("stops a deferred second search conservatively when another unchanged allowance cannot fit", async () => {
  invoke.mockResolvedValueOnce(response([pending(), result(), answer()]))
    .mockResolvedValueOnce(response([pending("srv-2")], "pause_turn", 0));
  const session = new AnthropicWebSearchSession(client);
  expect(await session.search("first public query")).toMatchObject({ status: "complete" });
  expect(await session.search("second public query")).toMatchObject({ status: "limit" });
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("marks long evidence as truncated and clips at a complete whitespace boundary", async () => {
  invoke.mockResolvedValue(response([pending(), result(), { ...answer(), text: "A useful sentence. ".repeat(200) }]));
  const evidence = await new AnthropicWebSearchSession(client).search("public query");
  expect(evidence).toMatchObject({ status: "complete", truncated: true, sources: [url] });
  if (evidence.status === "complete") {
    expect(evidence.text).toContain("[Search evidence truncated.");
    expect(evidence.text.length).toBeLessThan(2500);
    expect(evidence.text).not.toMatch(/sent\n/);
  }
});

it("does not replace pending tools or retry an uncertain provider failure", async () => {
  invoke.mockResolvedValueOnce(response([pending()], "pause_turn", 0)).mockRejectedValueOnce({ status: 400, message: "web_search pending validation failed" });
  const session = new AnthropicWebSearchSession(client);
  expect(await session.search("public query")).toMatchObject({ status: "unavailable" });
  expect(await session.search("retry public query")).toMatchObject({ status: "unavailable" });
  expect(invoke).toHaveBeenCalledTimes(2);
});

it.each(["javascript:alert(1)", "https://credential@private.example/path", "not a URL"])("rejects an unsafe source %s", async source => {
  invoke.mockResolvedValue(response([pending(), result("srv-1", source), answer(source)]));
  expect(await new AnthropicWebSearchSession(client).search("public query")).toMatchObject({ status: "unavailable" });
});

it("rejects invented citations and general knowledge without a verified search", async () => {
  invoke.mockResolvedValueOnce(response([pending(), result(), answer("https://invented.example/source")]))
    .mockResolvedValueOnce(response([answer()], "end_turn", 0));
  expect(await new AnthropicWebSearchSession(client).search("public query")).toMatchObject({ status: "unavailable" });
  expect(await new AnthropicWebSearchSession(client).search("public query")).toMatchObject({ status: "unavailable" });
});

it("turns malformed provider content into an unavailable search instead of retrying", async () => {
  invoke.mockResolvedValue(response([null]));
  const session = new AnthropicWebSearchSession(client);
  expect(await session.search("public query")).toMatchObject({ status: "unavailable" });
  expect(await session.search("another query")).toMatchObject({ status: "unavailable" });
  expect(invoke).toHaveBeenCalledOnce();
});

it("bounds the total search deadline rather than restarting it for continuations", async () => {
  const signals: AbortSignal[] = [];
  invoke.mockImplementation(async (_client, _request, _operation, signal) => {
    signals.push(signal!);
    vi.setSystemTime(Date.now() + 30001);
    return response([pending()], "pause_turn", 0);
  });
  expect(await new AnthropicWebSearchSession(client).search("public query")).toMatchObject({ status: "limit" });
  expect(signals).toHaveLength(1);
  expect(invoke).toHaveBeenCalledOnce();
});
