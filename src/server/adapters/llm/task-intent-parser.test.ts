import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicTaskIntentParser, parseTaskIntentResponse } from "./task-intent-parser";
import { isExplicitReminderRequest } from "../../domain/reminder-commands";

const { create, settings } = vi.hoisted(() => ({ create: vi.fn(), settings: { webSearch: false } }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
vi.mock("../../config/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../config/env")>()), requireEnv: () => ({ ANTHROPIC_API_KEY: "test-only", ANTHROPIC_MODEL: "test-model", ASSISTANT_WEB_SEARCH_ENABLED: settings.webSearch }) }));

describe("current-message routing", () => {
  const input = {
    message: "Hello", timezone: "America/New_York", now: new Date("2026-09-03T01:25:00Z"),
    openTasks: [], openGoals: [], memories: [],
    history: [{ id: "old", role: "user" as const, content: "Remind me tomorrow at 11 AM to add Davis to get home", createdAt: new Date("2026-08-19T12:00:00Z") }],
  };
  beforeEach(() => { create.mockReset(); settings.webSearch = false; });

  it.each(["Hello", "That’s not what I said to do", "Who are you? What can you do? Can you help me with anything?"])(
    "keeps %s conversational despite stale reminder history", async (message) => {
      create.mockResolvedValue({ content: [{ type: "text", text: "Hey! I’m Tempo. I can help with reminders, meals, and getting unstuck." }] });
      const result = await new AnthropicTaskIntentParser().parse({ ...input, message });
      expect(result.kind).toBe("conversation");
      const request = create.mock.calls[0][0];
      expect(request.tool_choice).toEqual({ type: "none" });
      const context = JSON.parse(request.messages[0].content);
      expect(context.currentMessage).toBe(message);
      expect(context.backgroundHistory[0]).toMatchObject({ text: input.history[0].content, at: "2026-08-19T12:00:00.000Z" });
    },
  );

  it("rejects a replayed tool quoting an old request without executing it", async () => {
    create.mockResolvedValue({ content: [{ type: "tool_use", name: "create_reminder", input: {
      sourceQuote: input.history[0].content, text: "Add Davis to get home", remindAt: "2026-09-03T15:00:00-04:00",
    } }] });
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message: "Can you text me and remind me to do the dishes at 9:26 in 1 minutes?" });
    expect(result.kind).toBe("conversation");
    expect(create.mock.calls[0][0].tools.map((tool: { name: string }) => tool.name)).toEqual(["create_reminder"]);
  });

  it("accepts the current reminder and supports a direct answer to a memory question", async () => {
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", name: "create_reminder", input: {
      sourceQuote: "remind me to do the dishes", text: "Do the dishes", remindAt: "2026-09-02T21:26:00-04:00",
    } }] });
    expect(await new AnthropicTaskIntentParser().parse({ ...input, message: "Can you remind me to do the dishes in 1 minute?" }))
      .toMatchObject({ kind: "command", command: { type: "create_reminder", text: "Do the dishes" } });
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", name: "remember_memory", input: {
      sourceQuote: "Frozen blueberries and yogurt", content: "Favorite food: frozen blueberries and yogurt.", category: "preference",
    } }] });
    expect(await new AnthropicTaskIntentParser().parse({ ...input, message: "Frozen blueberries and yogurt", history: [
      { id: "question", role: "assistant", content: "What’s one food you’d like me to remember?", createdAt: input.now },
    ] })).toMatchObject({ kind: "command", command: { type: "remember_memory", content: "Favorite food: frozen blueberries and yogurt." } });
  });

  it("rejects a tool even if the model ignores conversation-only mode", async () => {
    create.mockResolvedValue({ content: [{ type: "tool_use", name: "remember_memory", input: {
      sourceQuote: "Hello", content: "Favorite food: pizza.", category: "preference",
    } }] });
    expect((await new AnthropicTaskIntentParser().parse(input)).kind).toBe("conversation");
  });

  it("rejects stale action contents even when sourceQuote is a word from the current message", async () => {
    create.mockResolvedValue({ content: [{ type: "tool_use", id: "stale", name: "create_reminder", input: {
      sourceQuote: "me", text: "Add Davis to get home", remindAt: "2026-09-03T15:00:00Z",
    } }] });
    const execute = vi.fn();
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message: "Remind me in two minutes to do the dishes", execute });
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "conversation", reply: expect.stringContaining("latest message") });
  });

  it("preserves a verified action result when the follow-up model call fails", async () => {
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "memory", name: "remember_memory", input: {
      sourceQuote: "pizza", content: "Favorite food: pizza.", category: "preference",
    } }] }).mockRejectedValueOnce(new Error("unavailable"));
    const execute = vi.fn(async () => "Added to your favorite-food list: pizza.");
    expect(await new AnthropicTaskIntentParser().parse({ ...input, message: "Remember pizza as my favorite food", execute }))
      .toEqual({ kind: "conversation", reply: "Added to your favorite-food list: pizza." });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("refuses unsolicited proactive opt-in even if a tool quotes current text", async () => {
    create.mockResolvedValue({ content: [{ type: "tool_use", id: "opt-in", name: "set_checkins", input: {
      sourceQuote: "What is proactive coaching", enabled: true, dailyCap: 3,
    } }] });
    const execute = vi.fn();
    await new AnthropicTaskIntentParser().parse({ ...input, message: "What is proactive coaching", execute });
    expect(execute).not.toHaveBeenCalled();
  });

  it("caps hosted searches across model continuations and preserves citations", async () => {
    settings.webSearch = true;
    const budgets: Array<number | undefined> = [];
    create.mockImplementation(async (request: { tools: Array<{ name: string; max_uses?: number }> }) => {
      budgets.push(request.tools.find((tool) => tool.name === "web_search")?.max_uses);
      if (budgets.length <= 2) return { stop_reason: "pause_turn", content: [{ type: "server_tool_use", id: `search-${budgets.length}`, name: "web_search" }] };
      return { content: [{ type: "text", text: "Here is the current information.", citations: [{ type: "web_search_result_location", url: "https://example.test/source" }] }] };
    });
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message: "Search for current information" });
    expect(budgets).toEqual([2, 1, undefined]);
    expect(result).toMatchObject({ kind: "conversation", reply: expect.stringContaining("https://example.test/source") });
  });

  it("feeds a completed memory action back to the model for the rest of the request", async () => {
    create
      .mockResolvedValueOnce({ content: [{ type: "tool_use", id: "memory-1", name: "remember_memory", input: {
        sourceQuote: "frozen blueberries", content: "Favorite food: frozen blueberries.", category: "preference",
      } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "Saved. For dessert, try frozen blueberries with yogurt and a little honey." }] });
    const execute = vi.fn(async () => "Added to your favorite-food list: frozen blueberries.");
    const result = await new AnthropicTaskIntentParser().parse({ ...input,
      message: "Please remember frozen blueberries and suggest a dessert",
      execute,
    });
    expect(result).toEqual({ kind: "conversation", reply: "Added to your favorite-food list: frozen blueberries.\nSaved. For dessert, try frozen blueberries with yogurt and a little honey." });
    expect(execute).toHaveBeenCalledWith({ type: "remember_memory", content: "Favorite food: frozen blueberries.", category: "preference" });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages.at(-1)).toMatchObject({ content: [{ type: "tool_result", tool_use_id: "memory-1" }] });
  });
});

describe("Anthropic task tool boundary", () => {
  it("validates a tool-use block into a command", () => {
    expect(
      parseTaskIntentResponse([
        {
          type: "tool_use",
          name: "create_task",
          input: { title: "Finish report", estimatedMinutes: 90, dueAt: "2026-08-21T17:00:00-04:00" },
        },
      ]),
    ).toEqual({
      kind: "command",
      command: {
        type: "create_task",
        title: "Finish report",
        estimatedMinutes: 90,
        dueAt: "2026-08-21T17:00:00-04:00",
      },
    });
  });

  it("rejects invalid model-generated structured actions", () => {
    expect(() =>
      parseTaskIntentResponse([{ type: "tool_use", name: "complete_task", input: {} }]),
    ).toThrow("A task reference is required");
  });

  it("validates goal tool use through the same deterministic boundary", () => {
    expect(parseTaskIntentResponse([{ type: "tool_use", name: "create_goal", input: { title: "Run a half marathon" } }]))
      .toEqual({ kind: "command", command: { type: "create_goal", title: "Run a half marathon" } });
    expect(() => parseTaskIntentResponse([{ type: "tool_use", name: "complete_goal", input: {} }]))
      .toThrow("A goal reference is required");
  });

  it("validates a calendar-aware task reschedule request", () => {
    expect(parseTaskIntentResponse([{
      type: "tool_use",
      name: "reschedule_task",
      input: { taskQuery: "report", afterToday: true },
    }])).toEqual({
      kind: "command",
      command: { type: "reschedule_task", taskQuery: "report", afterToday: true },
    });
  });

  it("validates an exact reminder instant through the same structured boundary", () => {
    expect(parseTaskIntentResponse([{
      type: "tool_use",
      name: "create_reminder",
      input: { text: "submit the report", remindAt: "2026-08-21T22:00:00-04:00" },
    }])).toEqual({
      kind: "command",
      command: { type: "create_reminder", text: "submit the report", remindAt: "2026-08-21T22:00:00-04:00" },
    });
  });

  it("recognizes explicit future outreach wording as reminder intent", () => {
    expect(isExplicitReminderRequest("Remind me tomorrow at 10 PM to call Mom")).toBe(true);
    expect(isExplicitReminderRequest("Text me Friday morning about the report")).toBe(true);
    expect(isExplicitReminderRequest("Check in with me in 20 minutes")).toBe(true);
    expect(isExplicitReminderRequest("I need to call Mom tomorrow")).toBe(false);
  });

  it("validates a structured durable memory action", () => {
    expect(parseTaskIntentResponse([{
      type: "tool_use",
      name: "remember_memory",
      input: { content: "Favorite food: pizza.", category: "preference" },
    }])).toEqual({
      kind: "command",
      command: { type: "remember_memory", content: "Favorite food: pizza.", category: "preference" },
    });
  });

  it("rejects an unknown tool name", () => {
    expect(() => parseTaskIntentResponse([{ type: "tool_use", name: "delete_everything", input: {} }])).toThrow(
      "Unsupported task tool",
    );
  });

  it("returns a compact conversational response when no tool is used", () => {
    expect(parseTaskIntentResponse([{ type: "text", text: "That sounds heavy. Want to choose one tiny next step?" }])).toEqual({
      kind: "conversation",
      reply: "That sounds heavy. Want to choose one tiny next step?",
    });
  });
});
