import { beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import { DrizzleReminderRepository } from "../db/repositories/reminder-repository";
import { conversationMessages, scheduledActions } from "../db/schema";
import { AnthropicTaskIntentParser } from "../adapters/llm/task-intent-parser";
import { plainSmsText } from "../domain/sms-text";

const { create, authorize } = vi.hoisted(() => ({ create: vi.fn(), authorize: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
vi.mock("../adapters/llm/turn-authorizer", () => ({ AnthropicTurnAuthorizer: class { authorize = authorize; } }));
vi.mock("../config/env", async original => ({ ...(await original<typeof import("../config/env")>()), requireEnv: () => ({ ANTHROPIC_API_KEY: "test", ANTHROPIC_MODEL: "test", ASSISTANT_WEB_SEARCH_ENABLED: false }) }));
beforeEach(() => { create.mockReset(); authorize.mockReset().mockResolvedValue({ mode: "write", commands: ["create_reminders", "reschedule_reminders"] }); });

it.each(["extra-time", "wrong-day", "advice", "negated"])("blocks a fabricated reminder batch: %s", async scenario => {
  const message = scenario === "advice" ? "Would reminders tomorrow at 2 PM and 5 PM help?" : scenario === "negated" ? "Do not add reminders tomorrow at 2 PM and 5 PM" : "Remind me tomorrow at 2 PM and 5 PM to pick up the charger";
  if (scenario === "advice") authorize.mockResolvedValue({ mode: "read_only", commands: [] });
  const reminders = [14,17,...(scenario === "extra-time" ? [20] : [])].map(hour => ({ text: "Pick up the charger", remindAt: `2026-10-${scenario === "wrong-day" ? "04" : "03"}T${hour}:00:00-04:00` }));
  create.mockResolvedValue({ content: [{ type: "tool_use", id: "batch", name: "create_reminders", input: { sourceQuote: message, reminders } }] });
  const execute = vi.fn();
  await new AnthropicTaskIntentParser().parse({ message, now: new Date("2026-10-02T16:00:00Z"), timezone: "America/New_York", openTasks: [], openGoals: [], memories: [], execute });
  expect(execute).not.toHaveBeenCalled();
});

it("requires a current lookup before editing a reminder ID, then edits that exact ID", async () => {
  const message = "Move my library reminder to 12 PM", id = "00000000-0000-4000-8000-000000000042";
  const write = { type: "tool_use", id: "edit", name: "reschedule_reminder", input: { sourceQuote: message, reminderId: id, remindAt: "2026-10-03T12:00:00-04:00" } };
  create.mockResolvedValueOnce({ content: [write] })
    .mockResolvedValueOnce({ content: [{ type: "tool_use", id: "lookup", name: "list_reminders", input: { sourceQuote: message } }] })
    .mockResolvedValueOnce({ content: [write] })
    .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
  const execute = vi.fn(async command => command.type === "list_reminders" ? JSON.stringify({ items: [{ id, text: "Call library", remindAt: "2026-10-03T17:00:00-04:00" }] }) : "Reminder moved.");
  await new AnthropicTaskIntentParser().parse({ message, now: new Date("2026-10-02T16:00:00Z"), timezone: "America/New_York", openTasks: [], openGoals: [], memories: [], execute });
  expect(execute.mock.calls.map(([command]) => command.type)).toEqual(["list_reminders", "reschedule_reminder"]);
});

it("keeps batch writes atomic and account-owned, and replays their persisted result", async () => {
  const sim = await createAssistantSimulator({ parse: async () => ({ kind: "conversation", reply: "Fixture source" }) });
  try {
    const user = await sim.user(), other = await sim.user();
    const source = async (person: typeof user) => {
      const turn = await person.send("Fixture source");
      return (await sim.database.select().from(conversationMessages).where(eq(conversationMessages.providerMessageSid, turn.providerId)))[0].id;
    };
    const repository = new DrizzleReminderRepository(sim.database);
    const sourceMessageId = await source(user);
    const items = [5,6].map(day => ({ text: "Call the library", remindAt: new Date(`2026-11-0${day}T22:00:00Z`) }));
    const original = await repository.createMany({ userId: user.id, sourceMessageId, timezone: "America/New_York", items });
    const replay = await repository.createMany({ userId: user.id, sourceMessageId, timezone: "America/New_York", items: [...items].reverse() });
    expect(replay).toEqual(original);
    const foreign = await repository.createMany({ userId: other.id, sourceMessageId: await source(other), timezone: "America/New_York", items });
    const now = new Date("2026-10-02T16:00:00Z"), editSource = await source(user);
    const changes = original.map(item => ({ reminderId: item.id, expectedRemindAt: item.remindAt, remindAt: new Date(item.remindAt.getTime() - 5 * 3600_000) }));
    expect(await repository.updateMany({ userId: user.id, sourceMessageId: editSource, now, changes: [changes[0], { ...changes[1], reminderId: foreign[0].id }] })).toEqual({ kind: "stale" });
    expect(await repository.updateMany({ userId: user.id, sourceMessageId: editSource, now, changes: [changes[0], { ...changes[1], expectedRemindAt: now }] })).toEqual({ kind: "stale" });
    expect((await user.state()).reminders.map(row => row.remindAt)).toEqual(original.map(row => row.remindAt));
    expect((await repository.updateMany({ userId: user.id, sourceMessageId: editSource, now, changes })).kind).toBe("updated");
    expect((await repository.updateMany({ userId: user.id, sourceMessageId: editSource, now, changes })).kind).toBe("updated");
    const jobs = (await sim.database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).filter(row => row.kind === "deliver_reminder");
    expect(jobs.filter(row => row.status === "scheduled")).toHaveLength(2);
    expect(jobs.filter(row => row.status === "cancelled")).toHaveLength(2);
    expect((await other.state()).reminders.map(row => row.remindAt)).toEqual(foreign.map(row => row.remindAt));
  } finally { await sim.close(); }
}, 30_000);

it("renders SMS formatting as readable text while retaining links and time labels", () => {
  expect(plainSmsText("## Today\n**Homework** at `11 AM`\n[Open planner](https://example.test/workspace)"))
    .toBe("Today\nHomework at 11 AM\nOpen planner (https://example.test/workspace)");
});
