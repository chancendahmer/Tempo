import { beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { AnthropicTaskIntentParser } from "../adapters/llm/task-intent-parser";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import { DrizzleReminderRepository } from "../db/repositories/reminder-repository";
import { conversationMessages, lifeActionReceipts, reminders, scheduledActions } from "../db/schema";

const { create, authorize } = vi.hoisted(() => ({ create: vi.fn(), authorize: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
vi.mock("../adapters/llm/turn-authorizer", () => ({ AnthropicTurnAuthorizer: class { authorize = authorize; } }));
vi.mock("../config/env", async original => ({ ...(await original<typeof import("../config/env")>()), requireEnv: () => ({ AI_BUDGET_MODE: "off", ANTHROPIC_API_KEY: "test", ANTHROPIC_MODEL: "test", ASSISTANT_WEB_SEARCH_ENABLED: false }) }));
const now = new Date("2026-10-15T16:00:00Z");
const tool = (name: string, sourceQuote: string, data: object) => ({ content: [{ type: "tool_use", id: name, name, input: { ...data, sourceQuote } }] });
beforeEach(() => {
  create.mockReset();
  authorize.mockReset().mockResolvedValue({ mode: "write", commands: ["create_reminders"] });
});

it("cancels both requested reminders and delivery jobs after a current lookup, preserving other reminders", async () => {
  const sim = await createAssistantSimulator(new AnthropicTaskIntentParser());
  sim.setTime(now);
  try {
    const user = await sim.user();
    const request = "Remind me tomorrow at 2 PM and 5 PM to take a QA stretch break";
    create.mockResolvedValueOnce(tool("create_reminders", request, { reminders: [14, 17].map(hour => ({ text: "QA stretch break", remindAt: `2026-10-16T${hour}:00:00-04:00` })) }));
    await user.send(request);
    const originals = (await user.state()).reminders;
    expect(originals).toHaveLength(2);
    const source = (await sim.database.select().from(conversationMessages).where(eq(conversationMessages.userId, user.id))).find(row => row.direction === "inbound")!;
    await sim.database.insert(reminders).values({ userId: user.id, sourceMessageId: source.id, sourceOperation: 7, text: "Other reminder", timezone: "America/New_York", remindAt: new Date("2026-10-17T18:00:00Z"), idempotencyKey: "unrelated-cancellation-fixture" });
    const cancel = "Cancel both QA stretch break reminders for tomorrow.";
    authorize.mockResolvedValue({ mode: "write", commands: ["cancel_reminders"] });
    create.mockResolvedValueOnce(tool("list_reminders", cancel, {}))
      .mockResolvedValueOnce(tool("cancel_reminders", cancel, { reminders: originals.map(row => ({ reminderId: row.id, expectedRemindAt: row.remindAt.toISOString() })) }));
    const result = await user.send(cancel);
    expect(result.tools).toEqual(["list_reminders", "cancel_reminders"]);
    expect(result.replies.join(" ")).toContain("Cancelled reminders:");
    const rows = await sim.database.select().from(reminders).where(eq(reminders.userId, user.id));
    expect(rows.filter(row => originals.some(original => original.id === row.id)).map(row => row.status)).toEqual(["cancelled", "cancelled"]);
    expect(rows.find(row => row.text === "Other reminder")?.status).toBe("scheduled");
    const jobs = (await sim.database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).filter(row => row.kind === "deliver_reminder");
    expect(jobs).toHaveLength(2);
    expect(jobs.every(row => row.status === "cancelled")).toBe(true);
    await user.send(cancel, { providerId: result.providerId });
    expect((await sim.database.select().from(reminders).where(eq(reminders.userId, user.id))).map(row => row.status)).toEqual(rows.map(row => row.status));
  } finally { await sim.close(); }
}, 30_000);

it("rejects stale, foreign, duplicate and sending targets atomically; retries replay without cancelling later edits", async () => {
  const sim = await createAssistantSimulator({ parse: async () => ({ kind: "conversation", reply: "Fixture source" }) });
  sim.setTime(now);
  try {
    const user = await sim.user(), other = await sim.user();
    const source = async (person: typeof user) => {
      const turn = await person.send("Fixture source");
      return (await sim.database.select().from(conversationMessages).where(eq(conversationMessages.providerMessageSid, turn.providerId)))[0].id;
    };
    const repository = new DrizzleReminderRepository(sim.database);
    const items = [18, 21].map(hour => ({ text: "QA stretch break", remindAt: new Date(`2026-10-16T${hour}:00:00Z`) }));
    const original = await repository.createMany({ userId: user.id, sourceMessageId: await source(user), timezone: "America/New_York", items });
    const foreignSource = await source(other);
    const foreign = await repository.createMany({ userId: other.id, sourceMessageId: foreignSource, timezone: "America/New_York", items });
    const input = { userId: user.id, sourceMessageId: await source(user), now, reminders: original.map(row => ({ reminderId: row.id, expectedRemindAt: row.remindAt })) };
    expect(await repository.cancelMany({ ...input, sourceMessageId: foreignSource })).toEqual({ kind: "stale" });
    expect(await repository.cancelMany({ ...input, reminders: [input.reminders[0], { ...input.reminders[1], reminderId: foreign[0].id }] })).toEqual({ kind: "stale" });
    expect(await repository.cancelMany({ ...input, reminders: [input.reminders[0], { ...input.reminders[1], expectedRemindAt: now }] })).toEqual({ kind: "stale" });
    expect(await repository.cancelMany({ ...input, reminders: [input.reminders[0], input.reminders[0]] })).toEqual({ kind: "stale" });
    await sim.database.update(reminders).set({ status: "sending" }).where(eq(reminders.id, original[1].id));
    expect(await repository.cancelMany(input)).toEqual({ kind: "stale" });
    expect((await sim.database.select().from(reminders).where(eq(reminders.id, original[0].id)))[0].status).toBe("scheduled");
    expect((await sim.database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).filter(row => row.kind === "deliver_reminder").every(row => row.status === "scheduled")).toBe(true);
    await sim.database.update(reminders).set({ status: "scheduled" }).where(eq(reminders.id, original[1].id));
    const saved = await repository.cancelMany(input);
    expect(saved.kind).toBe("cancelled");
    expect(await repository.cancelMany({ ...input, reminders: [...input.reminders].reverse() })).toEqual(saved);
    expect(await sim.database.select().from(lifeActionReceipts).where(eq(lifeActionReceipts.userId, user.id))).toHaveLength(1);
    expect((await sim.database.select().from(scheduledActions).where(eq(scheduledActions.userId, user.id))).filter(row => row.kind === "deliver_reminder").every(row => row.status === "cancelled")).toBe(true);
    expect((await other.state()).reminders.map(row => row.status)).toEqual(["scheduled", "scheduled"]);
    // A late retry must not cancel a new scheduled occurrence or a different batch.
    const later = new Date("2026-10-17T18:00:00Z");
    await sim.database.update(reminders).set({ status: "scheduled", remindAt: later }).where(eq(reminders.id, original[0].id));
    expect(await repository.cancelMany(input)).toEqual(saved);
    expect((await sim.database.select().from(reminders).where(eq(reminders.id, original[0].id)))[0]).toMatchObject({ status: "scheduled", remindAt: later });
    expect(await repository.cancelMany({ ...input, reminders: [{ ...input.reminders[0], expectedRemindAt: later }, input.reminders[1]] })).toEqual({ kind: "stale" });
  } finally { await sim.close(); }
}, 30_000);

const ids = ["00000000-0000-4000-8000-000000000071", "00000000-0000-4000-8000-000000000072"];
const targets = ids.map((reminderId, index) => ({ reminderId, expectedRemindAt: `2026-10-16T${index ? 21 : 18}:00:00Z` }));
const parseInput = { now, timezone: "America/New_York", openTasks: [], openGoals: [], memories: [] };

it("requires both exact current IDs and times before executing the batch cancellation", async () => {
  const message = "Cancel both QA stretch break reminders for tomorrow.";
  authorize.mockResolvedValue({ mode: "write", commands: ["cancel_reminders"] });
  create.mockResolvedValueOnce(tool("cancel_reminders", message, { reminders: targets }))
    .mockResolvedValueOnce(tool("list_reminders", message, {}))
    .mockResolvedValueOnce(tool("cancel_reminders", message, { reminders: targets }));
  const execute = vi.fn(async command => command.type === "list_reminders" ? JSON.stringify({ items: targets.map(row => ({ id: row.reminderId, remindAt: row.expectedRemindAt, text: "QA stretch break" })) }) : "Cancelled reminders: both.");
  await new AnthropicTaskIntentParser().parse({ ...parseInput, message, execute });
  expect(execute.mock.calls.map(([command]) => command.type)).toEqual(["list_reminders", "cancel_reminders"]);
});

it.each(["read_only", "uncertain", "single-grant", "explicit-no-change"])("does not cancel a batch with %s authorization", async scenario => {
  const message = scenario === "explicit-no-change" ? "Cancel both QA stretch break reminders for tomorrow. Do not change anything yet." : scenario === "read_only" ? "Do not cancel either QA stretch break reminder for tomorrow." : "Cancel both QA stretch break reminders for tomorrow.";
  authorize.mockResolvedValue(scenario === "read_only" || scenario === "uncertain" ? { mode: scenario, commands: [] } : { mode: "write", commands: [scenario === "single-grant" ? "cancel_reminder" : "cancel_reminders"] });
  create.mockResolvedValue(tool("cancel_reminders", message, { reminders: targets }));
  const execute = vi.fn();
  const result = await new AnthropicTaskIntentParser().parse({ ...parseInput, message, execute });
  expect(execute).not.toHaveBeenCalled();
  expect(result).toMatchObject({ kind: "conversation", reply: expect.stringContaining("haven’t changed") });
});
