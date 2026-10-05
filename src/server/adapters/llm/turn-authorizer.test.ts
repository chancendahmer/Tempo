import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicTurnAuthorizer } from "./turn-authorizer";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
vi.mock("../../config/env", async importOriginal => ({ ...(await importOriginal<typeof import("../../config/env")>()), requireEnv: () => ({ ANTHROPIC_API_KEY: "test-only", ANTHROPIC_MODEL: "test-model" }) }));

describe("independent turn authorization adapter", () => {
  beforeEach(() => { create.mockReset(); });
  it("uses a tool-free classifier contract without executing the proposed operation", async () => {
    create.mockResolvedValue({ content: [{ type: "tool_use", name: "classify_turn", input: { mode: "read_only", commands: [] } }] });
    const input = { message: "Would remembering that I like pizza be helpful?" };
    expect(await new AnthropicTurnAuthorizer().authorize(input)).toEqual({ mode: "read_only", commands: [] });
    const request = create.mock.calls[0][0];
    expect(request.tools.map((tool: { name: string }) => tool.name)).toEqual(["classify_turn"]);
    expect(request.tools[0].strict).toBe(true);
    expect(request.tool_choice).toMatchObject({ name: "classify_turn", disable_parallel_tool_use: true });
    expect(JSON.parse(request.messages[0].content)).toEqual({ currentMessage: input.message, precedingExchange: null });
  });

  it.each([
    { mode: "read_only", commands: ["life_remove"] },
    { mode: "write", commands: [] },
    { mode: "write", commands: ["unregistered_tool"] },
    { mode: "write", commands: ["create_task"], bypass: true },
  ])("rejects malformed or contradictory permission: %j", async input => {
    create.mockResolvedValue({ content: [{ type: "tool_use", name: "classify_turn", input }] });
    expect(await new AnthropicTurnAuthorizer().authorize({ message: "Hello" })).toEqual({ mode: "uncertain", commands: [] });
  });

  it("fails closed on provider failure instead of accepting the original tool", async () => {
    create.mockRejectedValue(new Error("Provider unavailable"));
    expect(await new AnthropicTurnAuthorizer().authorize({ message: "Add milk" })).toEqual({ mode: "uncertain", commands: [] });
  });

  it("does not interpret free text as a permission grant", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "Sure, authorized." }] });
    expect(await new AnthropicTurnAuthorizer().authorize({ message: "Add milk" })).toEqual({ mode: "uncertain", commands: [] });
  });
});

 it.each(["max_tokens", "refusal"])("never authorizes a %s response even if it contains a valid-looking grant", async stop_reason => {
  create.mockResolvedValue({ stop_reason, content: [{ type: "tool_use", name: "classify_turn", input: { mode: "write", commands: ["create_reminder"] } }] });
  expect(await new AnthropicTurnAuthorizer().authorize({ message: "11am?" })).toEqual({ mode: "uncertain", commands: [] });
});
