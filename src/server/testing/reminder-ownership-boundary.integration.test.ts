import { expect, it, vi } from "vitest";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import type { CoachingCommand } from "../adapters/llm/task-intent-parser";
import { DrizzleConversationRepository } from "../db/repositories/conversation-repository";
import type { InboundConversationContext } from "../domain/conversation-orchestrator";

it("holds the account lock only during reminder mutations, outside parser, authorization and SMS awaits", async () => {
  let active = 0, lockedMutations = 0;
  let command: CoachingCommand = { type: "create_reminder", text: "Studio plan", remindAt: "2027-01-12T17:00:00Z" };
  const original = DrizzleConversationRepository.prototype.withOwnership;
  const ownership = vi.spyOn(DrizzleConversationRepository.prototype, "withOwnership").mockImplementation(async function<T>(
    this: DrizzleConversationRepository, context: InboundConversationContext, operation: () => Promise<T>, options?: { accountFirst?: boolean },
  ): Promise<T> {
    return original.call(this, context, async () => {
      if (!options?.accountFirst) return operation();
      active++; lockedMutations++;
      try { return await operation(); } finally { active--; }
    }, options) as Promise<T>;
  });
  const simulation = await createAssistantSimulator({
    authorizer: { authorize: async () => {
      expect(active).toBe(0);
      return { mode: "write", commands: ["create_reminder", "reschedule_reminder", "create_task"] };
    } },
    parse: async input => {
      expect(active).toBe(0);
      const reply = await input.execute!(command);
      expect(active).toBe(0);
      return { kind: "conversation", reply };
    },
  });
  const transportSend = simulation.transport.send.bind(simulation.transport);
  const send = vi.spyOn(simulation.transport, "send");
  send.mockImplementation(async request => { expect(active).toBe(0); return transportSend(request); });
  simulation.setTime(new Date("2027-01-11T15:00:00Z"));
  try {
    const person = await simulation.user();
    await person.send("Remind me about the studio plan tomorrow at noon");
    expect((await person.state()).reminders).toHaveLength(1);
    expect(lockedMutations).toBe(1);
    const reminderId = (await person.state()).reminders[0].id;
    command = { type: "reschedule_reminder", reminderId, remindAt: "2027-01-13T17:00:00Z" };
    await person.send("Move my studio reminder to Wednesday at noon");
    expect((await person.state()).reminders[0].remindAt.toISOString()).toBe("2027-01-13T17:00:00.000Z");
    expect(lockedMutations).toBe(2);
    command = { type: "list_reminders" };
    await person.send("Which reminders are saved?");
    expect(lockedMutations).toBe(2);
    command = { type: "create_task", title: "Review studio ideas" };
    await person.send("Add a task to review studio ideas");
    expect((await person.state()).tasks).toHaveLength(1);
    expect(lockedMutations).toBe(2);
    expect(send).toHaveBeenCalled();
  } finally { await simulation.close(); ownership.mockRestore(); }
}, 30_000);
