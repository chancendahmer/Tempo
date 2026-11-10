import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, vi } from "vitest";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import type { CoachingCommand } from "../adapters/llm/task-intent-parser";
import { WRITE_COMMANDS } from "../domain/turn-write-policy";
import { mutateWorkspace } from "../db/repositories/workspace-repository";
import { DrizzleReminderRepository } from "../db/repositories/reminder-repository";
import { DrizzleOutboundMessageRepository } from "../db/repositories/outbound-message-repository";
import { SafeSmsSender } from "../domain/outbound-messaging";
import { scheduledActions } from "../db/schema";

/** Explicit scripted commands/authorization, not live model interpretation. */
export async function firstWeek() {
  vi.useFakeTimers({ toFake: ["Date"] });
  let commands: CoachingCommand[] = [], readOnly = false, replyPrefix = "";
  const simulator = await createAssistantSimulator({
    authorizer: { authorize: async () => {
      const grants = WRITE_COMMANDS.filter(type => commands.some(command => command.type === type));
      return readOnly || !grants.length ? { mode: "read_only", commands: [] } : { mode: "write", commands: grants };
    } },
    parse: async input => {
      const results: string[] = [];
      for (const command of commands) results.push(await input.execute!(command));
      return { kind: "conversation", reply: replyPrefix + (results.join("\n") || "Scripted advice: consider a smaller next step.") };
    },
  });
  const person = await simulator.user(), outsider = await simulator.user();
  await mutateWorkspace(outsider.id, { action: "save", id: randomUUID(), version: 0, data: { kind: "note", title: "OUTSIDER_WEEK_PRIVATE", body: "Separate account" } }, simulator.database);
  const privateBefore = await outsider.state();
  const external = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External providers forbidden in first-week acceptance"));
  const checkpoints: number[] = [];
  const day = (index: number, utc = "15:00:00") => {
    const now = new Date(`2027-01-${String(10 + index).padStart(2, "0")}T${utc}Z`);
    vi.setSystemTime(now); simulator.setTime(now); return now;
  };
  day(1);
  return {
    simulator, person, outsider, day, checkpoints,
    async turn(text: string, next: CoachingCommand[] = [], options: { readOnly?: boolean; channel?: "sms" | "web"; fixtureReplyPrefix?: string } = {}) {
      commands = next; readOnly = options.readOnly ?? false; replyPrefix = options.fixtureReplyPrefix ?? "";
      const turn = await person.send(text, { channel: options.channel ?? "sms" });
      expect(JSON.stringify(turn)).not.toContain("OUTSIDER_WEEK_PRIVATE");
      return turn;
    },
    async checkpoint(index: number) {
      const saved = await person.workspace();
      expect(JSON.stringify(saved)).not.toContain("OUTSIDER_WEEK_PRIVATE");
      expect(await outsider.state()).toEqual(privateBefore);
      checkpoints.push(index); return saved;
    },
    async deliver(reminderId: string) {
      const repository = new DrizzleReminderRepository(simulator.database);
      const reminder = (await person.state()).reminders.find(row => row.id === reminderId)!;
      const context = await repository.getDeliveryContext(reminderId, reminder.remindAt);
      expect(context).not.toBeNull();
      expect(await repository.markSending(reminderId, reminder.remindAt, new Date())).toBe(true);
      const sender = new SafeSmsSender(new DrizzleOutboundMessageRepository(simulator.database), simulator.transport);
      const request = { userId: person.id, body: `Reminder: ${reminder.text}`, kind: "coach" as const, relatedReminderId: reminderId, idempotencyKey: repository.getOccurrenceIdempotencyKey(reminderId, reminder.remindAt) };
      const sent = await sender.send(request);
      if (!sent.sent) throw new Error("Expected captured fake transport send");
      await repository.recordSuccessfulDelivery(context!, reminder.remindAt, sent.provider, sent.providerMessageSid, new Date());
      expect(await sender.send(request)).toMatchObject({ sent: false, reason: "duplicate" });
      // This helper explicitly emulates job completion; no pg-boss worker is running.
      await simulator.database.update(scheduledActions).set({ status: "completed", completedAt: new Date() }).where(and(eq(scheduledActions.reminderId, reminderId), eq(scheduledActions.runAt, reminder.remindAt)));
      return sent;
    },
    async close() { try { await simulator.close(); expect(external).not.toHaveBeenCalled(); } finally { external.mockRestore(); vi.useRealTimers(); } },
  };
}
