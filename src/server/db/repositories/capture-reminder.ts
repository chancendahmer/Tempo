import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { assistantCommandSchema, type AssistantCommand } from "../../domain/assistant-commands";
import { isSensitiveMemory } from "../../domain/memory-service";
import { formatReminderTime } from "../../domain/reminder-service";
import type { TempoDatabase } from "../client";
import { conversationMessages, lifeActionReceipts, lifeItems, users } from "../schema";
import { DrizzleTaskRepository } from "./task-repository";
import { DrizzleGoalRepository } from "./goal-repository";
import { DrizzleReminderRepository } from "./reminder-repository";

/** One authorized capture, one transaction, one replayable receipt. */
export async function captureWithReminder(database: TempoDatabase, userId: string, sourceMessageId: string,
  input: Extract<AssistantCommand, { type: "capture_with_reminder" }>, now: Date, timezone: string) {
  const command = assistantCommandSchema.parse(input);
  if (command.type !== "capture_with_reminder") throw new Error("Invalid capture command");
  if (isSensitiveMemory(`${command.title}\n${command.details ?? ""}`)) return "I can save everyday plans, but not secrets or sensitive medical details. Nothing was saved.";
  return database.transaction(async transaction => {
    const tx = transaction as unknown as TempoDatabase;
    const [source] = await tx.select({ id: conversationMessages.id }).from(conversationMessages)
      .where(and(eq(conversationMessages.id, sourceMessageId), eq(conversationMessages.userId, userId), eq(conversationMessages.direction, "inbound"))).for("update");
    if (!source) throw new Error("Invalid capture source");
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const key = `capture:${userId}:${sourceMessageId}`;
    const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    const [prior] = await tx.select().from(lifeActionReceipts).where(and(eq(lifeActionReceipts.key, key), eq(lifeActionReceipts.userId, userId)));
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new Error("Capture replay differs from the saved request");
      return prior.message;
    }
    const remindAt = new Date(command.remindAt);
    if (remindAt <= now) return "That reminder time has passed. What future time should I use? Nothing was saved yet.";
    let taskId: string | undefined;
    if (command.destination === "note") {
      await tx.insert(lifeItems).values({ id: sourceMessageId, userId, data: { kind: "note", title: command.title, body: command.details ?? "" } });
    } else if (command.destination === "task") {
      taskId = (await new DrizzleTaskRepository(tx).create({userId, sourceMessageId, title: command.title})).id;
    } else {
      await new DrizzleGoalRepository(tx).create({userId, sourceMessageId, title: command.title, description: command.details});
    }
    const reminder = await new DrizzleReminderRepository(tx).create({userId, sourceMessageId, text: command.title, remindAt, timezone, taskId});
    const destination = { note: "Thought inbox", task: "Tasks", goal: "Goals" }[command.destination];
    const message = `Saved to ${destination}: ${command.title}.\nReminder set for ${formatReminderTime(reminder.remindAt, timezone)}.`;
    await tx.insert(lifeActionReceipts).values({key, userId, fingerprint, message});
    return message;
  });
}
