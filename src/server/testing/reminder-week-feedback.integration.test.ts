import { beforeEach, expect, it, vi } from "vitest";
import { AnthropicTaskIntentParser } from "../adapters/llm/task-intent-parser";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import { eq } from "drizzle-orm";
import { conversationMessages, reminders, scheduledActions } from "../db/schema";

const { create, authorize } = vi.hoisted(() => ({ create: vi.fn(), authorize: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
vi.mock("../adapters/llm/turn-authorizer", () => ({ AnthropicTurnAuthorizer: class { authorize = authorize; } }));
vi.mock("../config/env", async original => ({ ...(await original<typeof import("../config/env")>()), requireEnv: () => ({ ANTHROPIC_API_KEY: "test", ANTHROPIC_MODEL: "test", ASSISTANT_WEB_SEARCH_ENABLED: false }) }));
const now = new Date("2026-10-02T16:00:00Z");
const input = { message: "", timezone: "America/New_York", now, openTasks: [], openGoals: [], memories: [] };
const tool = (name: string, sourceQuote: string, data: object) => ({ content: [{ type: "tool_use", id: name, name, input: { ...data, sourceQuote } }] });
const ack = { content: [{ type: "text", text: "ACK_ONLY" }] };
beforeEach(() => { create.mockReset(); authorize.mockReset().mockResolvedValue({ mode: "write", commands: ["create_task", "create_reminder", "create_reminders", "reschedule_reminder", "reschedule_reminders"] }); });

it("saves an undated task when a user changes a reminder request to 'just add to my list'", async () => {
  const message = "Just add to my list, no specific time";
  create.mockResolvedValueOnce(tool("create_task", message, { title: "Compare product ideas" })).mockResolvedValueOnce(ack);
  const execute = vi.fn(async () => "Added: Compare product ideas.");
  await new AnthropicTaskIntentParser().parse({ ...input, message, execute, history: [
    { id: "ask", role: "user", content: "Reminder to compare product ideas", createdAt: now },
    { id: "reply", role: "assistant", replyToMessageId: "ask", content: "When do you want this reminder?", createdAt: now },
  ] });
  expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "create_task", title: "Compare product ideas" });
});

it("creates two requested times together and replaying the inbound does not duplicate reminders or jobs", async () => {
  const simulation = await createAssistantSimulator(new AnthropicTaskIntentParser());
  simulation.setTime(now);
  try {
    const person = await simulation.user();
    const message = "Remind me on Saturday October 3 at 2 PM and 5 PM to pick up the charger";
    create.mockResolvedValueOnce(tool("create_reminders", message, { reminders: [
      { text: "Pick up the charger", remindAt: "2026-10-03T14:00:00-04:00" },
      { text: "Pick up the charger", remindAt: "2026-10-03T17:00:00-04:00" },
    ] })).mockResolvedValueOnce(ack);
    const result = await person.send(message);
    expect((await person.state()).reminders.map(row => row.remindAt.toISOString()).sort()).toEqual(["2026-10-03T18:00:00.000Z", "2026-10-03T21:00:00.000Z"]);
    expect(result.replies.join(" ")).toContain("2:00 PM");
    expect(result.replies.join(" ")).toContain("5:00 PM");
    await person.send(message, { providerId: result.providerId });
    expect((await person.state()).reminders).toHaveLength(2);
    expect((await simulation.database.select().from(scheduledActions).where(eq(scheduledActions.userId, person.id))).filter(row => row.kind === "deliver_reminder")).toHaveLength(2);
  } finally { await simulation.close(); }
}, 30_000);

it("keeps the delivered reminder subject through a second time clarification", async () => {
  const message = "Exactly 2pm";
  create.mockResolvedValueOnce(tool("create_reminder", message, { text: "Pick up the charger", remindAt: "2026-10-04T14:00:00-04:00" })).mockResolvedValueOnce(ack);
  const execute = vi.fn(async () => "Reminder set for Sunday at 2 PM.");
  await new AnthropicTaskIntentParser().parse({ ...input, now: new Date("2026-10-03T21:51:00Z"), message, execute, history: [
    { id: "notification", role: "assistant", content: "Reminder: Pick up the charger", relatedReminder: { id: "00000000-0000-4000-8000-000000000031", text: "Pick up the charger", remindAt: "2026-10-03T18:00:00Z" }, createdAt: new Date("2026-10-03T18:00:00Z") },
    { id: "ask", role: "user", content: "Thanks for the reminder, can you remind me tomorrow at like 2 PM also?", createdAt: new Date("2026-10-03T21:50:00Z") },
    { id: "reply", role: "assistant", replyToMessageId: "ask", content: "Exactly 2 PM?", createdAt: now },
  ] });
  expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "create_reminder", text: "Pick up the charger", remindAt: "2026-10-04T14:00:00-04:00" });
});

it("asks once for a missing morning time without saving a fabricated 9 AM reminder", async () => {
  const message = "Give me a morning reminder tomorrow of my to-do list";
  create.mockResolvedValueOnce(tool("create_reminder", message, { text: "My to-do list", remindAt: "2026-10-03T09:00:00-04:00" })).mockResolvedValueOnce(ack);
  const execute = vi.fn();
  const result = await new AnthropicTaskIntentParser().parse({ ...input, message, execute });
  expect(execute).not.toHaveBeenCalled();
  expect(result).toMatchObject({ reply: expect.stringMatching(/what time/i) });
});

it("moves both same-name reminders by current IDs, preserves their dates, and cancels both old jobs", async () => {
  const simulation = await createAssistantSimulator(new AnthropicTaskIntentParser());
  simulation.setTime(now);
  try {
    const person = await simulation.user();
    const message = "Create a reminder at 5 PM on Monday and Tuesday to call the library";
    create.mockResolvedValueOnce(tool("create_reminders", message, { reminders: [
      { text: "Call the library", remindAt: "2026-10-05T17:00:00-04:00" },
      { text: "Call the library", remindAt: "2026-10-06T17:00:00-04:00" },
    ] }));
    await person.send(message);
    const original = (await person.state()).reminders;
    expect(original).toHaveLength(2);
    const edit = "Change my Monday and Tuesday reminders to call the library to 12 PM";
    create.mockResolvedValueOnce(tool("list_reminders", edit, {})).mockResolvedValueOnce(tool("reschedule_reminders", edit, { changes: original.map(row => ({ reminderId: row.id, expectedRemindAt: row.remindAt.toISOString(), remindAt: row.remindAt.toISOString().replace("21:00", "16:00") })) })).mockResolvedValueOnce(ack);
    const result = await person.send(edit);
    expect(result.tools).toEqual(["list_reminders", "reschedule_reminders"]);
    const current = await simulation.database.select().from(reminders).where(eq(reminders.userId, person.id));
    expect(current.map(row => row.id).sort()).toEqual(original.map(row => row.id).sort());
    expect(current.map(row => row.remindAt.toISOString()).sort()).toEqual(["2026-10-05T16:00:00.000Z", "2026-10-06T16:00:00.000Z"]);
    const jobs = (await simulation.database.select().from(scheduledActions).where(eq(scheduledActions.userId, person.id))).filter(row => row.kind === "deliver_reminder");
    expect(jobs.filter(row => row.status === "scheduled")).toHaveLength(2);
    expect(jobs.filter(row => row.status === "cancelled")).toHaveLength(2);
    const inbound = await simulation.database.select().from(conversationMessages).where(eq(conversationMessages.providerMessageSid, result.providerId));
    expect(inbound).toHaveLength(1);
  } finally { await simulation.close(); }
}, 30_000);

it("confirms the saved reminder once without a model rewrite that can contradict its timezone", async () => {
  const message = "Remind me in two minutes to stretch";
  create.mockResolvedValueOnce(tool("create_reminder", message, { text: "Stretch", remindAt: "2026-10-02T16:02:00Z" }))
    .mockResolvedValueOnce({ content: [{ type: "text", text: "Reminder set for 6:02 PM EDT." }] });
  const saved = "Reminder set for Fri, Oct 2, 12:02 PM EDT: Stretch";
  const result = await new AnthropicTaskIntentParser().parse({ ...input, message, execute: async () => saved });
  expect(result).toEqual({ kind: "conversation", reply: saved });
  expect(create).toHaveBeenCalledTimes(1);
});
