import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicTaskIntentParser, hasCurrentActionEvidence, parseTaskIntentResponse } from "./task-intent-parser";
import { isExplicitReminderRequest } from "../../domain/reminder-commands";
import { AssistantProviderFailure } from "../../domain/assistant-provider-failure";
import { HEALTH_CAPABILITY_LIMIT } from "../../domain/connection-status-reply";
import { RUNDOWN_HISTORY_LIMIT } from "../../domain/rundown";
import { WRITE_COMMANDS } from "../../domain/turn-write-policy";

const { create, authorize, settings } = vi.hoisted(() => ({ create: vi.fn(), authorize: vi.fn(), settings: { webSearch: false } }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
vi.mock("./turn-authorizer", () => ({ AnthropicTurnAuthorizer: class { authorize = authorize; } }));
vi.mock("../../config/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../config/env")>()), requireEnv: () => ({ ANTHROPIC_API_KEY: "test-only", ANTHROPIC_MODEL: "test-model", ASSISTANT_WEB_SEARCH_ENABLED: settings.webSearch }) }));

vi.mock("./turn-authorizer", () => ({ AnthropicTurnAuthorizer: class { authorize = authorize; } }));

describe("current-message routing", () => {
  it.each(["missing", "wrong-content", "verified"])("requires a fresh memory lookup before ID-based deletion: %s", async scenario => {
    const message = "Forget the saved fact about my spare keys.";
    const memoryId = "00000000-0000-4000-8000-000000000092", content = "Spare keys are in the blue bowl.";
    if (scenario !== "missing") create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "read", name: "recall_memories", input: { query: "spare keys", sourceQuote: message } }] });
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "forget", name: "forget_memory", input: { memoryId, expectedContent: scenario === "wrong-content" ? "Invented fact" : content, sourceQuote: message } }] })
      .mockResolvedValue({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async (command: { type: string }) => command.type === "recall_memories" ? JSON.stringify({ memories: [{ id: memoryId, content }] }) : "Removed saved memory.");
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute.mock.calls.filter(([command]) => command.type === "forget_memory")).toHaveLength(scenario === "verified" ? 1 : 0);
  });
  it.each(["set 5PM too", "Yes, add the 5 PM one too", "5 PM as well please"])("grounds an authorized extra reminder in the linked exchange: %s", async message => {
    authorize.mockResolvedValue({ mode: "write", commands: ["create_reminder"] });
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "extra", name: "create_reminder", input: { sourceQuote: message, text: "Drink water", remindAt: "2026-09-03T17:00:00-04:00" } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Also set: Drink water at 5 PM.");
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
      { id: "request", role: "user", content: "Remind me to drink water at 3 PM.", createdAt: input.now },
      { id: "offer", role: "assistant", replyToMessageId: "request", content: "Set for 3 PM. Would you like one at 5 PM too?", createdAt: input.now },
      { id: "interruption", role: "assistant", content: "Your requested reminder to stretch.", createdAt: input.now },
    ] });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "create_reminder", text: "Drink water", remindAt: "2026-09-03T17:00:00-04:00" });
    expect(result).toEqual({ kind: "conversation", reply: "Also set: Drink water at 5 PM." });
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it.each(["unlinked", "human-pivot", "unrelated-subject"])("does not revive reminder context from %s", async scenario => {
    const message = "set 5PM too";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "extra", name: "create_reminder", input: { sourceQuote: message, text: scenario === "unrelated-subject" ? "Pay rent" : "Drink water", remindAt: "2026-09-03T17:00:00-04:00" } }] });
    const execute = vi.fn();
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
      { id: "request", role: "user", content: "Remind me to drink water at 3 PM.", createdAt: input.now },
      { id: "offer", role: "assistant", replyToMessageId: scenario === "unlinked" ? "other" : "request", content: "Set for 3 PM. Would you like one at 5 PM too?", createdAt: input.now },
      ...(scenario === "human-pivot" ? [{ id: "pivot", role: "user" as const, content: "Let's talk about dinner instead.", createdAt: input.now }] : []),
    ] });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["Would another reminder be useful?", "read_only"],
    ["Maybe, I'm not sure", "uncertain"],
    ["Do not add the 5 PM one", "write"],
  ])("does not let a linked suggestion grant permission: %s", async (message, mode) => {
    authorize.mockResolvedValue({ mode, commands: mode === "write" ? ["create_reminder"] : [] });
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "extra", name: "create_reminder", input: { sourceQuote: message, text: "Drink water", remindAt: "2026-09-03T17:00:00-04:00" } }] });
    const execute = vi.fn();
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
      { id: "request", role: "user", content: "Remind me to drink water at 3 PM.", createdAt: input.now },
      { id: "offer", role: "assistant", replyToMessageId: "request", content: "Set for 3 PM. Would you like one at 5 PM too?", createdAt: input.now },
    ] });
    expect(execute).not.toHaveBeenCalled();
  });

  it("grounds every grocery item rather than allowing one requested item to authorize extras", () => {
    const message = "Add cucumber, lemon and feta to my shopping list.";
    expect(hasCurrentActionEvidence({ type: "grocery_add", items: ["Cucumber", "Lemon", "Feta"] }, message)).toBe(true);
    expect(hasCurrentActionEvidence({ type: "grocery_add", items: ["Cucumber", "Vodka"] }, message)).toBe(false);
  });
  const input = {
    message: "Hello", timezone: "America/New_York", now: new Date("2026-09-03T01:25:00Z"),
    openTasks: [], openGoals: [], memories: [],
    history: [{ id: "old", role: "user" as const, content: "Remind me tomorrow at 11 AM to add Davis to get home", createdAt: new Date("2026-08-19T12:00:00Z") }],
  };
  beforeEach(() => {
    create.mockReset(); settings.webSearch = false;
    // Existing tests isolate grounding/schema behavior after an independent grant.
    authorize.mockReset().mockResolvedValue({ mode: "write", commands: [...WRITE_COMMANDS] });
  });

  it("cannot delete a routine during an explicit no-change question after a valid lookup", async () => {
    const message = "What happens if I delete my routine? Do not change anything.";
    const id = "00000000-0000-4000-8000-000000000091";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "read", name: "life_list", input: { kind: "routine", sourceQuote: message } }] })
      .mockResolvedValueOnce({ content: [{ type: "tool_use", id: "delete", name: "life_remove", input: { id, version: 2, sourceQuote: message } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async (command: unknown) => { void command; return JSON.stringify([{ id, version: 2 }]); });
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute.mock.calls.map(call => call[0])).toEqual([{ type: "life_list", kind: "routine" }]);
    expect(result).toMatchObject({ kind: "conversation", reply: expect.stringMatching(/no changes|haven.t changed/i) });
  });

  it("never enables check-ins from negated consent", async () => {
    const message = "Please do not enable proactive check-ins";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "opt", name: "set_checkins", input: { enabled: true, dailyCap: 2, sourceQuote: message } }] });
    const execute = vi.fn();
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute).not.toHaveBeenCalled();
    expect(hasCurrentActionEvidence({ type: "set_checkins", enabled: true, dailyCap: 2 }, message)).toBe(false);
  });

  it.each([
    { message: "What should I do about the report?", name: "update_task", args: { taskQuery: "report", patch: { title: "Finish report" } } },
    { message: "Would remembering that I like pizza be helpful?", name: "remember_memory", args: { content: "Favorite food: pizza.", category: "preference" } },
    { message: "Which groceries go with rice?", name: "grocery_add", args: { items: ["Rice"] } },
    { message: "How would lemon rice taste?", name: "life_save", args: { data: { kind: "recipe", title: "Lemon rice", ingredients: "Rice and lemon", instructions: "Cook rice.", servings: 2, prepMinutes: 20, favorite: false } } },
  ])("rejects fabricated $name writes during advice, with or without an executor", async ({ message, name, args }) => {
    authorize.mockResolvedValue({ mode: "read_only", commands: [] });
    const execute = vi.fn(async () => "Saved.");
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "write", name, input: { ...args, sourceQuote: message } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    expect(await new AnthropicTaskIntentParser().parse({ ...input, message, execute })).toMatchObject({ kind: "conversation" });
    expect(execute).not.toHaveBeenCalled();
    create.mockReset().mockResolvedValueOnce({ content: [{ type: "tool_use", id: "write", name, input: { ...args, sourceQuote: message } }] });
    expect(await new AnthropicTaskIntentParser().parse({ ...input, message })).toMatchObject({ kind: "conversation" });
  });

  it("allows an ordinary indirect request under its exact command grant", async () => {
    const message = "I'm out of milk; could you put it on my shopping list?";
    authorize.mockResolvedValue({ mode: "write", commands: ["grocery_add"] });
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "write", name: "grocery_add", input: { items: ["Milk"], sourceQuote: message } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Added Milk.");
    expect(await new AnthropicTaskIntentParser().parse({ ...input, message, execute })).toEqual({ kind: "conversation", reply: "Added Milk." });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "grocery_add", items: ["Milk"] });
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])("preserves explicit check-in consent changes (%s)", async enabled => {
    const message = `Please ${enabled ? "enable" : "disable"} proactive check-ins.`;
    authorize.mockResolvedValue({ mode: "write", commands: ["set_checkins"] });
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "consent", name: "set_checkins", input: { enabled, dailyCap: 2, sourceQuote: message } }] });
    const execute = vi.fn(async () => "Check-in preference saved.");
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "set_checkins", enabled, dailyCap: 2 });
  });

  it.each(["uncertain", "wrong-command", "malformed", "unavailable"])("fails closed on %s authority with one clarification", async scenario => {
    const message = "Maybe change the report.";
    if (scenario === "unavailable") authorize.mockRejectedValue(new Error("unavailable"));
    else authorize.mockResolvedValue(scenario === "malformed" ? { mode: "write", commands: ["anything"] }
      : scenario === "wrong-command" ? { mode: "write", commands: ["remember_memory"] } : { mode: "uncertain", commands: [] });
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "write", name: "update_task", input: { taskQuery: "report", patch: { title: "Report" }, sourceQuote: message } }] });
    const execute = vi.fn();
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "conversation", reply: expect.stringContaining("What change") });
    if (result.kind === "conversation") expect(result.reply.match(/\?/g)).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each(["coach", "short-question", "human-pivot", "wrong-link"])("resolves task clarification across only unsolicited outputs (%s)", async scenario => {
    const message = "9 AM works.";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "task", name: "create_task", input: { sourceQuote: message, title: "Stretch", estimatedMinutes: 5, dueAt: "2026-09-06T09:00:00-04:00" } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Task saved.");
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
      { id: "request", role: "user", content: "Add a five-minute stretch for Sunday morning as a task.", createdAt: input.now },
      { id: "question", role: "assistant", replyToMessageId: scenario === "wrong-link" ? "other" : "request", content: scenario === "short-question" ? "What time Sunday morning works for you?" : "What time on Sunday morning would you like to schedule it?", createdAt: input.now },
      ...(scenario === "human-pivot" ? [{ id: "pivot", role: "user" as const, content: "Actually, let's talk about food instead.", createdAt: input.now }] : []),
      { id: "coach", role: "assistant", content: "How is your afternoon going? Want a small next step?", createdAt: input.now },
    ] });
    expect(execute).toHaveBeenCalledTimes(scenario === "coach" || scenario === "short-question" ? 1 : 0);
  });

  it("keeps a linked routine clarification through an unsolicited coaching message", async () => {
    const message = "7:30 AM works.";
    const data = { kind: "routine", title: "Easy start", period: "morning", time: "07:30", steps: [{ title: "Drink water", minutes: 2 }] };
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "routine", name: "life_save", input: { sourceQuote: message, data } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Routine saved.");
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
      { id: "request", role: "user", content: "Make a morning routine with drinking water.", createdAt: input.now },
      { id: "question", role: "assistant", replyToMessageId: "request", content: "What time should the routine start?", createdAt: input.now },
      { id: "coach", role: "assistant", content: "Remember to take a break.", createdAt: input.now },
    ] });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("keeps the original Sunday when a time clarification model supplies Monday", async () => {
    const message = "9 AM works.";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "task", name: "create_task", input: { sourceQuote: message, title: "Stretch", estimatedMinutes: 5, dueAt: "2026-10-05T09:00:00-04:00" } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Task saved.");
    const requestedAt = new Date("2026-09-30T23:00:00Z");
    await new AnthropicTaskIntentParser().parse({ ...input, now: requestedAt, message, execute, history: [
      { id: "request", role: "user", content: "Add a five-minute stretch for Sunday morning as a task.", createdAt: requestedAt },
      { id: "question", role: "assistant", replyToMessageId: "request", content: "What time Sunday morning works for you?", createdAt: requestedAt },
      { id: "interruption", role: "assistant", content: "Your requested reminder.", createdAt: requestedAt },
    ] });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "create_task", title: "Stretch", estimatedMinutes: 5, dueAt: "2026-10-04T13:00:00.000Z" });
  });

  it("anchors tomorrow to the original request when its clock answer arrives after midnight", async () => {
    const message = "9 AM works.";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "task", name: "create_task", input: { sourceQuote: message, title: "Stretch", dueAt: "2026-10-02T09:00:00-04:00" } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Task saved."), requestedAt = new Date("2026-10-01T03:55:00Z");
    await new AnthropicTaskIntentParser().parse({ ...input, now: new Date("2026-10-01T04:05:00Z"), message, execute, history: [
      { id: "request", role: "user", content: "Add a stretch task for tomorrow morning.", createdAt: requestedAt },
      { id: "question", role: "assistant", replyToMessageId: "request", content: "What time tomorrow morning?", createdAt: requestedAt },
    ] });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "create_task", title: "Stretch", dueAt: "2026-10-01T13:00:00.000Z" });
  });

  it("asks instead of executing a model-chosen ambiguous DST instant", async () => {
    const message = "Add a stretch task on 2027-11-07 at 1:30 AM";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "task", name: "create_task", input: { sourceQuote: message, title: "Stretch", dueAt: "2027-11-07T01:30:00-04:00" } }] });
    const execute = vi.fn();
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ reply: expect.stringContaining("occurs twice") });
  });

  it.each([
    { request: "Add a stretch task on 2027-03-14 at 2:30 AM", answer: "3:30 AM", question: "That local time does not exist because the clocks change. What time should I use instead?", dueAt: "2027-03-14T03:30:00-04:00", expected: "2027-03-14T07:30:00.000Z" },
    { request: "Add a stretch task on 2027-11-07 at 1:30 AM", answer: "1:30 AM UTC-05:00", question: "That local time occurs twice because the clocks change. What time and UTC offset should I use?", dueAt: "2027-11-07T01:30:00-04:00", expected: "2027-11-07T06:30:00.000Z" },
  ])("completes a linked DST clarification without retaining the old clock ($answer)", async ({ request, answer, question, dueAt, expected }) => {
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "task", name: "create_task", input: { sourceQuote: answer, title: "Stretch", dueAt } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Task saved.");
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message: answer, execute, history: [
      { id: "request", role: "user", content: request, createdAt: input.now },
      { id: "question", role: "assistant", replyToMessageId: "request", content: question, createdAt: input.now },
    ] });
    expect(result).toEqual({ kind: "conversation", reply: "Task saved." });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "create_task", title: "Stretch", dueAt: expected });
  });

  it("bounds initial task and goal context with explicit completeness metadata", async () => {
    create.mockResolvedValueOnce({ content: [{ type: "text", text: "Current plan." }] });
    await new AnthropicTaskIntentParser().parse({ ...input, message: "What should I do first?",
      openTasks: Array.from({ length: 1000 }, (_, i) => ({ id: `task-${i}`, title: `Task ${i}`, status: "not_started" as const })),
      openGoals: Array.from({ length: 100 }, (_, i) => ({ id: `goal-${i}`, title: `Goal ${i}`, status: "active" as const })),
    });
    const system = create.mock.calls[0][0].system;
    expect(system).toContain('"total":1000,"included":50,"truncated":true');
    expect(system).toContain('"total":100,"included":25,"truncated":true');
    expect(system).toContain('"id":"task-49"');
    expect(system).not.toContain('"id":"task-50"');
    expect(system).not.toContain('"id":"goal-25"');
  });

  it.each([
    ["9 AM works.", true, "Walk/jog", "2026-09-05T09:00:00-04:00", true],
    ["9 AM works.", false, "Walk/jog", "2026-09-05T09:00:00-04:00", false],
    ["9 AM works.", true, "Buy groceries", "2026-09-05T09:00:00-04:00", false],
    ["9 AM works.", true, "Walk/jog", "2026-09-05T10:00:00-04:00", false],
    ["2 PM please.", true, "Walk/jog", "2026-09-05T14:00:00-04:00", false],
    ["9 AM, don't save it.", true, "Walk/jog", "2026-09-05T09:00:00-04:00", false],
  ])("completes only a grounded linked task-time answer (%s, %s, %s)", async (message, linked, title, dueAt, allowed) => {
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "task", name: "create_task", input: { sourceQuote: message, title, dueAt, estimatedMinutes: 10 } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Task saved.");
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
      { id: "request", role: "user", content: "Add a 10-minute walk/jog for Saturday morning.", createdAt: input.now },
      { id: "question", role: "assistant", replyToMessageId: linked ? "request" : "other", content: "What time in the morning would you like that task?", createdAt: input.now },
    ] });
    expect(execute).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });

  it.each([
    ["Add a 10-minute walk/jog for Saturday morning", "2026-09-05T12:00:00-04:00", false],
    ["Add a 10-minute walk/jog for Saturday morning", "2026-09-05T09:00:00-04:00", false],
    ["Add a walk/jog for Saturday morning", undefined, false],
    ["Add a walk/jog for Saturday morning at 9 AM", "2026-09-05T12:00:00-04:00", false],
    ["Add a walk/jog for Saturday morning at 9 AM", "2026-09-05T13:00:00Z", true],
    ["Add a walk/jog for Saturday afternoon at 2 PM", "2026-09-05T14:00:00-04:00", true],
    ["Add a walk/jog for Saturday evening", "2026-09-05T19:00:00-04:00", false],
  ])("does not invent or contradict a task scheduling window (%s)", async (message, dueAt, allowed) => {
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "task", name: "create_task", input: { sourceQuote: message, title: "Walk/jog", ...(dueAt ? { dueAt } : {}) } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Task saved.");
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (!allowed) expect(result).toMatchObject({ reply: expect.stringMatching(/what time/i) });
  });

  it.each([
    [true, "07:30", "Get dressed", "7:30am please.", true],
    [true, "07:30", "Get dressed", "7:30 AM works.", true],
    [true, "07:30", "Get dressed", "7:30 AM works for me.", true],
    [true, "07:30", "Get dressed", "7:30 AM is good.", true],
    [true, "07:30", "Get dressed", "7:30 AM sounds fine!", true],
    [false, "07:30", "Get dressed", "7:30 AM works.", false],
    [true, "08:00", "Get dressed", "7:30 AM works.", false],
    [true, "07:30", "Buy groceries", "7:30 AM works.", false],
    [true, "07:30", "Get dressed", "7:30 AM doesn't work.", false],
    [true, "07:30", "Get dressed", "7:30 AM works, but don't save it.", false],
  ])("grounds routine start-time answers in the linked request (%s, %s, %s, %s)", async (linked, time, lastStep, message, allowed) => {
    const data = { kind: "routine", title: "Easy start", period: "morning", time, steps: ["Drink water", "Brush my teeth", lastStep].map((title, i) => ({ id: `00000000-0000-4000-8000-00000000008${i}`, title, minutes: 2, completedOn: null })) };
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

  it.each(["morning", "evening"] as const)("creates an unnamed %s routine without asking for a cosmetic choice", period => {
    const result = parseTaskIntentResponse([{ type: "tool_use", name: "life_save", input: { data: {
      kind: "routine", period, time: "08:00", steps: [{ title: "Drink water", minutes: 2 }],
    } } }]);
    expect(result).toMatchObject({ kind: "command", command: { type: "life_save", data: {
      title: period === "morning" ? "Morning routine" : "Evening routine",
      period, time: "08:00", steps: [{ title: "Drink water", minutes: 2, completedOn: null }],
    } } });
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

  it.each(["set 5PM too", "Yes, add the 5 PM one too", "5 PM as well please"])("grounds an authorized extra reminder in the linked exchange: %s", async message => {
    authorize.mockResolvedValue({ mode: "write", commands: ["create_reminder"] });
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "extra", name: "create_reminder", input: { sourceQuote: message, text: "Drink water", remindAt: "2026-09-03T17:00:00-04:00" } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async () => "Also set: Drink water at 5 PM.");
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
      { id: "request", role: "user", content: "Remind me to drink water at 3 PM.", createdAt: input.now },
      { id: "offer", role: "assistant", replyToMessageId: "request", content: "Set for 3 PM. Would you like one at 5 PM too?", createdAt: input.now },
      { id: "interruption", role: "assistant", content: "Your requested reminder to stretch.", createdAt: input.now },
    ] });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "create_reminder", text: "Drink water", remindAt: "2026-09-03T17:00:00-04:00" });
    expect(result).toEqual({ kind: "conversation", reply: "Also set: Drink water at 5 PM." });
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it.each(["unlinked", "human-pivot", "unrelated-subject"])("does not revive reminder context from %s", async scenario => {
    const message = "set 5PM too";
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "extra", name: "create_reminder", input: { sourceQuote: message, text: scenario === "unrelated-subject" ? "Pay rent" : "Drink water", remindAt: "2026-09-03T17:00:00-04:00" } }] });
    const execute = vi.fn();
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
      { id: "request", role: "user", content: "Remind me to drink water at 3 PM.", createdAt: input.now },
      { id: "offer", role: "assistant", replyToMessageId: scenario === "unlinked" ? "other" : "request", content: "Set for 3 PM. Would you like one at 5 PM too?", createdAt: input.now },
      ...(scenario === "human-pivot" ? [{ id: "pivot", role: "user" as const, content: "Let's talk about dinner instead.", createdAt: input.now }] : []),
    ] });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["Would another reminder be useful?", "read_only"],
    ["Maybe, I'm not sure", "uncertain"],
    ["Do not add the 5 PM one", "write"],
  ])("does not let a linked suggestion grant permission: %s", async (message, mode) => {
    authorize.mockResolvedValue({ mode, commands: mode === "write" ? ["create_reminder"] : [] });
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "extra", name: "create_reminder", input: { sourceQuote: message, text: "Drink water", remindAt: "2026-09-03T17:00:00-04:00" } }] });
    const execute = vi.fn();
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
      { id: "request", role: "user", content: "Remind me to drink water at 3 PM.", createdAt: input.now },
      { id: "offer", role: "assistant", replyToMessageId: "request", content: "Set for 3 PM. Would you like one at 5 PM too?", createdAt: input.now },
    ] });
    expect(execute).not.toHaveBeenCalled();
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
    if (message.includes("?")) authorize.mockResolvedValue({ mode: "uncertain", commands: [] });
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
      .mockResolvedValueOnce({ content: [{ type: "tool_use", id: "edit", name: "life_patch", input: { id, version: 2, patch: { kind: "recipe", servings: 3 }, sourceQuote: "Make it three servings" } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "It now serves three; the ingredients are unchanged." }] });
    const execute = vi.fn(async command => command.type === "life_list" ? JSON.stringify([{ id, version: 2, data: { ...data, servings: 2 } }]) : "Saved.");
    const result = await new AnthropicTaskIntentParser().parse({ ...input, message: "Make it three servings", execute });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][0]).toEqual({ type: "life_patch", id, version: 2, patch: { kind: "recipe", servings: 3 } });
    expect(result).toMatchObject({ reply: expect.stringContaining("Saved.") });
  });

  it("authorizes a note edit using the current bounded search result version", async () => {
    const id = "00000000-0000-4000-8000-000000000091";
    const message = "Update my spare keys note to say green bowl.";
    const data = { kind: "note", title: "Spare keys", body: "Green bowl" };
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "read", name: "life_list", input: { kind: "note", query: "spare keys", sourceQuote: message } }] })
      .mockResolvedValueOnce({ content: [{ type: "tool_use", id: "edit", name: "life_patch", input: { id, version: 2, patch: { kind: "note", body: "Green bowl" }, sourceQuote: message } }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
    const execute = vi.fn(async command => command.type === "life_list" ? JSON.stringify({ items: [{ id, version: 2, data }], truncated: false }) : "Saved.");
    await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][0]).toMatchObject({ type: "life_patch", id, version: 2 });
  });

  it.each(["life_patch", "life_remove"])("blocks %s with an ID that was not read this turn", async type => {
    create.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "unread", name: type, input: {
      id: "00000000-0000-4000-8000-000000000091", version: 2, sourceQuote: "Change it",
      ...(type === "life_patch" ? { patch: { kind: "note", body: "Updated" } } : {}),
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
