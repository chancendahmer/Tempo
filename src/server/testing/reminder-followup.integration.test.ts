import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import { AnthropicTaskIntentParser } from "../adapters/llm/task-intent-parser";
import { conversationMessages, scheduledActions } from "../db/schema";
import { requestedReminderTime } from "../domain/reminder-service";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
vi.mock("../adapters/llm/turn-authorizer", () => ({ AnthropicTurnAuthorizer: class {
  // Scripted permission decisions; this test verifies execution/history, not live model semantics.
  authorize = async () => ({ mode: "write", commands: ["create_reminder"] });
} }));
vi.mock("../config/env", async importOriginal => ({ ...(await importOriginal<typeof import("../config/env")>()),
  requireEnv: () => ({ ANTHROPIC_API_KEY: "test-only", ANTHROPIC_MODEL: "test-model", ASSISTANT_WEB_SEARCH_ENABLED: false }),
}));

it("adds a 5 PM SMS follow-up without losing 3 PM, leaking context or duplicating delivery work (scripted provider)", async () => {
  const now = new Date();
  const firstInput = "Remind me to drink water tomorrow at 3 PM.";
  const nextInput = "set 5PM too";
  const firstTime = requestedReminderTime(firstInput, now, "America/New_York")!;
  const nextTime = requestedReminderTime("Remind me tomorrow at 5 PM", now, "America/New_York")!;
  const proposal = (message: string, remindAt: string) => ({ content: [{ type: "tool_use", id: "reminder", name: "create_reminder",
    input: { sourceQuote: message, text: "Drink water", remindAt } }] });
  create.mockReset().mockResolvedValueOnce(proposal(firstInput, firstTime))
    .mockResolvedValueOnce({ content: [{ type: "text", text: "Would you like one at 5 PM too?" }] })
    .mockResolvedValueOnce(proposal(nextInput, nextTime)) // Another account must fail to resolve the subject.
    .mockResolvedValueOnce(proposal(nextInput, nextTime))
    .mockResolvedValueOnce({ content: [{ type: "text", text: "ACK_ONLY" }] });
  const simulation = await createAssistantSimulator(new AnthropicTaskIntentParser());
  simulation.setTime(now);
  try {
    const person = await simulation.user(), other = await simulation.user();
    const first = await person.send(firstInput);
    expect(first.tools).toEqual(["create_reminder"]);
    expect(first.replies.join(" ")).toContain("Would you like one at 5 PM too?");
    const initial = (await person.state()).reminders;
    expect(initial).toHaveLength(1);
    expect(initial[0].remindAt.toISOString()).toBe(firstTime);

    const [inbound] = await simulation.database.select().from(conversationMessages).where(eq(conversationMessages.providerMessageSid, first.providerId));
    // A delivered, unrelated proactive message has no reply link to the request.
    await simulation.database.insert(conversationMessages).values({ userId: person.id, conversationId: inbound.conversationId,
      direction: "outbound", kind: "coach", status: "delivered", body: "Time for your stretch break." });
    await other.send(nextInput);
    expect((await other.state()).reminders).toHaveLength(0);

    const next = await person.send(nextInput);
    expect(next.tools).toEqual(["create_reminder"]);
    expect(next.replies.join(" ")).toContain("Drink water");
    const stored = (await person.state()).reminders;
    expect(stored).toHaveLength(2);
    expect(stored.find(row => row.id === initial[0].id)?.remindAt.toISOString()).toBe(firstTime);
    expect(stored.map(row => row.remindAt.toISOString()).sort()).toEqual([firstTime, nextTime].sort());
    expect(stored.every(row => row.text === "Drink water")).toBe(true);
    const replay = await person.send(nextInput, { providerId: next.providerId });
    expect(replay).toMatchObject({ duplicate: true, parserCalled: false, replies: [] });
    expect((await person.state()).reminders).toHaveLength(2);
    const jobs = await simulation.database.select().from(scheduledActions).where(eq(scheduledActions.userId, person.id));
    expect(jobs.filter(job => job.kind === "deliver_reminder")).toHaveLength(2);
    expect(create).toHaveBeenCalledTimes(5);
  } finally { await simulation.close(); }
}, 30_000);
