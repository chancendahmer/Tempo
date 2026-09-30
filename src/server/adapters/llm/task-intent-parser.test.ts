import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicTaskIntentParser, parseTaskIntentResponse } from "./task-intent-parser";
import { isExplicitReminderRequest } from "../../domain/reminder-commands";
import { AssistantProviderFailure } from "../../domain/assistant-provider-failure";
import { HEALTH_CAPABILITY_LIMIT } from "../../domain/connection-status-reply";
import { RUNDOWN_HISTORY_LIMIT } from "../../domain/rundown";

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

  it.each([
    [true, "07:30", "Get dressed", true],
    [false, "07:30", "Get dressed", false],
    [true, "08:00", "Get dressed", false],
    [true, "07:30", "Buy groceries", false],
  ])("grounds routine start-time answers in the linked request (%s, %s, %s)", async (linked, time, lastStep, allowed) => {
    const message = "7:30am please.";
    const data = { kind: "routine", title: "Morning routine", period: "morning", time, steps: ["Drink water", "Brush my teeth", lastStep].map((title, i) => ({ id: `00000000-0000-4000-8000-00000000008${i}`, title, minutes: 2, completedOn: null })) };
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "routine", name: "life_save", input: { sourceQuote: message, data } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Morning routine saved.");
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
      { id: "routine-request", role: "user", content: "Mornings are chaotic. Can you make me a simple morning routine: drink water, brush my teeth, and get dressed?", createdAt: input.now },
      { id: "clarify", role: "assistant", replyToMessageId: linked ? "routine-request" : "unrelated", content: "What time do you want the routine to start?", createdAt: input.now },
    ] });
    expect(execute).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (allowed) expect(execute).toHaveBeenCalledWith({ type: "life_save", data: { ...data, steps: data.steps.map(step => ({ ...step, id: expect.any(String) })) } });
  });

  it("recovers malformed routine arguments by asking only for the missing user choice", async () => {
    const message = "Mornings are chaotic. Can you make me a simple morning routine: drink water, brush my teeth, and get dressed?";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "routine", name: "life_save", input: { sourceQuote: message, data: { kind: "routine", title: "Morning routine", period: "morning", steps: [] } } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "What time would you like your water, teeth and getting dressed routine to start?" }] });
    const execute = vi.fn();
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ reply: expect.stringContaining("What time") });
    expect(JSON.stringify(create.mock.calls[1][0].messages)).toContain("No action was performed");
  });

  it("assigns server-owned new routine IDs and completion state without a repair round trip", async () => {
    const message = "Save my morning routine at 8 AM: water for two minutes.";
    const data = { kind: "routine", title: "Morning routine", period: "morning", time: "08:00", steps: [{ id: "water", title: "Drink water", minutes: 2, completedOn: "2026-09-03" }] };
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "bad", name: "life_save", input: { sourceQuote: message, data } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Morning routine saved.");
    expect(await new AnthropicTaskIntentParser().parse({ ...input, message, execute })).toEqual({ kind: "conversation", reply: "Morning routine saved." });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ type: "life_save", data: { ...data, steps: [{ ...data.steps[0], id: expect.stringMatching(/^[0-9a-f-]{36}$/), completedOn: null }] } });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("keeps routine edits strict and does not invent missing times or durations", () => {
    const data = { kind: "routine", title: "Easy start", period: "morning", time: "07:30", steps: [{ title: "Drink water", minutes: 2 }] };
    const parse = (args: unknown) => parseTaskIntentResponse([{ type: "tool_use", name: "life_save", input: args }]);
    expect(() => parse({ data })).not.toThrow();
    expect(() => parse({ id: "00000000-0000-4000-8000-000000000091", version: 1, data })).toThrow();
    expect(() => parse({ data: { ...data, time: undefined } })).toThrow();
    expect(() => parse({ data: { ...data, steps: [{ title: "Drink water" }] } })).toThrow();
  });

  it("stops after one invalid-argument repair attempt without any mutation", async () => {
    const message = "Save my morning routine";
    create.mockResolvedValue({ content: [{ type: "tool_use", id: "bad", name: "life_save", input: { sourceQuote: message, data: { kind: "routine" } } }] });
    const execute = vi.fn();
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("keeps the rundown history limit while completing a compound write", async () => {
    const message = "Show my week and add a task to buy groceries";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "r", name: "get_rundown", input: { sourceQuote: message, startDate: "2026-08-31", days: 7 } }] })
      .mockResolvedValueOnce({ content: [{ type: "tool_use", id: "t", name: "create_task", input: { sourceQuote: "add a task to buy groceries", title: "Buy groceries" } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "Your dentist appointment is Friday." }] });
    const execute = vi.fn(async command => command.type === "get_rundown" ? `Dentist Friday.\n${RUNDOWN_HISTORY_LIMIT}` : "Added: Buy groceries.");
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ reply: expect.stringContaining(RUNDOWN_HISTORY_LIMIT) });
    expect(result).toMatchObject({ reply: expect.stringContaining("Added: Buy groceries.") });
  });

  it("renders the exact health limitation once when synthesis requests only its acknowledgement", async () => {
    const message = "Can you see my steps?";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "c", name: "connection_status", input: { sourceQuote: message } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message, execute: vi.fn(async () => HEALTH_CAPABILITY_LIMIT) });
    expect(result).toEqual({ kind: "conversation", reply: HEALTH_CAPABILITY_LIMIT });
  });

  it("returns a verified action receipt once when no extra answer is needed", async () => {
    const message = "Add a task to renew my library card";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "task", name: "create_task", input: { sourceQuote: message, title: "Renew library card" } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Added: Renew library card.");
    expect(await new AnthropicTaskIntentParser().parse({ ...input, message, execute })).toEqual({ kind: "conversation", reply: "Added: Renew library card." });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Don't remind me about laundry anymore", "cancel_reminder", { reminderQuery: "laundry" }],
    ["When will you remind me about laundry?", "list_reminders", {}],
    ["Can you remind me at 10 instead?", "reschedule_reminder", { reminderQuery: "laundry", remindAt: "2026-09-03T10:00:00-04:00" }],
  ])("allows reminder correction/lookup: %s", async (message, name, args) => {
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "reminder", name, input: { sourceQuote: message, ...args } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "Handled your reminder request." }] });
    const execute = vi.fn(async () => "Verified reminder result.");
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ type: name, ...args });
  });

  it.each([true, false])("accepts a time-only answer only with a linked reminder clarification (linked=%s)", async linked => {
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "r", name: "create_reminder", input: { sourceQuote: "At 8 tomorrow", text: "Pack lunch", remindAt: "2026-09-03T08:00:00-04:00" } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "Your reminder is set." }] });
    const execute = vi.fn(async () => "Reminder set: Pack lunch.");
    await new AnthropicTaskIntentParser().parse({ ...input, message: "At 8 tomorrow", execute, history: [
      { id: "request", role: "user", content: "Remind me to pack lunch", createdAt: input.now },
      { id: "clarify", role: "assistant", replyToMessageId: linked ? "request" : "unrelated", content: "What time should I remind you?", createdAt: input.now },
    ] });
    expect(execute).toHaveBeenCalledTimes(linked ? 1 : 0);
  });

  it.each([
    ["Just a task, no reminder time.", true, "Call the dentist", true],
    ["Make it a task instead.", true, "Call the dentist", true],
    ["Just a task, no reminder time.", false, "Call the dentist", false],
    ["Just a task, no reminder time.", true, "Buy groceries", false],
    ["What is a task?", true, "Call the dentist", false],
    ["Just a task?", true, "Call the dentist", false],
    ["Just a task? Don't save it yet.", true, "Call the dentist", false],
  ])("grounds a current task clarification without replay (%s, linked=%s, title=%s)", async (message, linked, title, allowed) => {
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "task", name: "create_task", input: { sourceQuote: message, title } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Added: Call the dentist.");
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
      { id: "request", role: "user", content: "I need to call the dentist tomorrow. Can you help me remember?", createdAt: input.now },
      { id: "clarify", role: "assistant", replyToMessageId: linked ? "request" : "other", content: "What time tomorrow should I remind you?", createdAt: input.now },
    ] });
    expect(execute).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });

  it("uses a linked meal suggestion only when the current message explicitly saves it", async () => {
    const message = "Put that in my meal plan for Friday";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "meal", name: "life_save", input: { sourceQuote: message, data: { kind: "meal", title: "Lemon rice", date: "2026-09-04", meal: "Dinner", ingredients: "rice, lemon" } } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "Ready for Friday." }] });
    const execute = vi.fn(async () => "Meal saved.");
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
      { id: "idea", role: "user", content: "What could I make for dinner?", createdAt: input.now },
      { id: "suggestion", role: "assistant", replyToMessageId: "idea", content: "Lemon rice: rice and lemon make a simple dinner.", createdAt: input.now },
    ] });
    expect(execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: "life_save", data: expect.objectContaining({ title: "Lemon rice" }) }));
  });

  it("uses the combined read-only rundown tool for a natural planning question", async () => {
    const message = "Can I get my reminders, goals, tasks and calendar for next week?";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "rundown", name: "get_rundown", input: { sourceQuote: message, startDate: "2026-09-07", days: 7 } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "Your week has a dentist appointment and one task due." }] });
    const execute = vi.fn(async () => "Weekly rundown: Dentist; Report due. Calendar current.");
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "get_rundown", startDate: "2026-09-07", days: 7 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it.each([
    [400, "Your credit balance is too low", "billing"],
    [401, "Unauthorized", "configuration"],
    [503, "Service unavailable", "transient"],
  ])("classifies provider status %s without executing an action", async (status, message, category) => {
    create.mockRejectedValueOnce({ status, message });
    const execute = vi.fn();
    await expect(new AnthropicTaskIntentParser().parse({ ...input, execute }))
      .rejects.toMatchObject({ name: "AssistantProviderFailure", category, status });
    expect(execute).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("accepts typographic quote differences in a current calendar lookup", async () => {
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "agenda", name: "calendar_agenda", input: {
      sourceQuote: "What's on my calendar Friday?", start: "2026-09-04T00:00:00-04:00", end: "2026-09-05T00:00:00-04:00",
    } }] }).mockResolvedValueOnce({ content: [{ type: "text", text: "Your Friday is clear." }] });
    const execute = vi.fn().mockResolvedValue('{"events":[]}');
    await new AnthropicTaskIntentParser().parse({ ...input, message: "What’s on my calendar Friday?", execute });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "calendar_agenda", start: "2026-09-04T00:00:00-04:00", end: "2026-09-05T00:00:00-04:00" });
  });

  it("returns verified check-in delivery limits without a contradictory model promise", async () => {
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "opt", name: "set_checkins", input: {
      sourceQuote: "Please enable proactive check-ins", enabled: true, dailyCap: 2,
    } }] }).mockResolvedValueOnce({ content: [{ type: "text", text: "I will text you twice a day." }] });
    const reply = "Check-in preference saved. Proactive delivery is disabled in this simulation.";
    const execute = vi.fn().mockResolvedValue(reply);
    expect(await new AnthropicTaskIntentParser().parse({ ...input, message: "Please enable proactive check-ins twice a day.", execute })).toEqual({ kind: "conversation", reply });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("preserves reply relationships in the model context across channels", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "Your recipe is saved." }] });
    await new AnthropicTaskIntentParser().parse({ ...input, history: [
      { id: "question", role: "user", content: "Save my recipe", createdAt: input.now },
      { id: "answer", role: "assistant", content: "Saved your lemon rice.", replyToMessageId: "question", createdAt: input.now },
    ] });
    const context = JSON.parse(create.mock.calls[0][0].messages[0].content);
    expect(context.backgroundHistory[1]).toMatchObject({ id: "answer", replyToMessageId: "question" });
  });

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
    const offered = create.mock.calls[0][0].tools.map((tool: { name: string }) => tool.name);
    expect(offered).toEqual(expect.arrayContaining(["create_reminder", "list_reminders", "cancel_reminder", "reschedule_reminder"]));
    expect(offered).not.toContain("create_task");
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

  it("applies a pronoun-based recipe edit only after a current version lookup", async () => {
    const id = "00000000-0000-4000-8000-000000000091";
    const data = { kind: "recipe", title: "Lemon rice", ingredients: "Rice and lemon", instructions: "Cook rice.", servings: 3, prepMinutes: 20, favorite: true };
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "read", name: "life_list", input: { kind: "recipe", sourceQuote: "Make it three servings" } }] })
      .mockResolvedValueOnce({ content: [{ type: "tool_use", id: "edit", name: "life_save", input: { id, version: 2, data, sourceQuote: "Make it three servings" } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "It now serves three; the ingredients are unchanged." }] });
    const execute = vi.fn(async command => command.type === "life_list" ? JSON.stringify([{ id, version: 2, data: { ...data, servings: 2 } }]) : "Saved.");
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message: "Make it three servings", execute });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][0]).toMatchObject({ type: "life_save", id, version: 2, data: { servings: 3 } });
    expect(result).toMatchObject({ reply: expect.stringContaining("Saved.") });
  });

  it.each(["life_save", "life_remove"])("blocks %s with an ID that was not read this turn", async type => {
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "unread", name: type, input: {
      id: "00000000-0000-4000-8000-000000000091", version: 2, sourceQuote: "Change it",
      ...(type === "life_save" ? { data: { kind: "note", title: "Weekend", body: "Updated" } } : {}),
    } }] }).mockResolvedValueOnce({ content: [{ type: "text", text: "Which note do you mean?" }] });
    const execute = vi.fn();
    await new AnthropicTaskIntentParser().parse({ ...input, message: "Change it", execute });
    expect(execute).not.toHaveBeenCalled();
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
    } }] }).mockRejectedValueOnce(new AssistantProviderFailure("billing", 400));
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
