import { ReminderCommand } from "./reminder-commands";

export type ReminderRecord = {
  id: string;
  text: string;
  remindAt: Date;
  timezone: string;
  status: "scheduled" | "sending" | "sent" | "cancelled" | "failed";
};

export interface ReminderRepository {
  findBySourceMessage(sourceMessageId: string): Promise<ReminderRecord | null>;
  create(input: {
    userId: string;
    sourceMessageId: string;
    text: string;
    remindAt: Date;
    timezone: string;
    taskId?: string;
  }): Promise<ReminderRecord>;
  listUpcoming(userId: string, now: Date): Promise<ReminderRecord[]>;
  cancel(input: { userId: string; reminderId?: string; reminderQuery?: string; now: Date }): Promise<
    | { kind: "cancelled"; reminder: ReminderRecord }
    | { kind: "not_found" }
    | { kind: "ambiguous"; reminders: ReminderRecord[] }
  >;
}

export function formatReminderTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export async function executeReminderCommand(
  repository: ReminderRepository,
  command: ReminderCommand,
  context: { userId: string; sourceMessageId: string; timezone: string; now: Date },
): Promise<string> {
  if (command.type === "create_reminder") {
    const prior = await repository.findBySourceMessage(context.sourceMessageId);
    if (prior) return `Reminder set for ${formatReminderTime(prior.remindAt, prior.timezone)}: ${prior.text}`;
    const remindAt = new Date(command.remindAt);
    if (remindAt <= context.now) return "That time has already passed. What future date and time should I use?";
    const reminder = await repository.create({
      userId: context.userId,
      sourceMessageId: context.sourceMessageId,
      text: command.text,
      remindAt,
      timezone: context.timezone,
      taskId: command.taskId,
    });
    return `Reminder set for ${formatReminderTime(reminder.remindAt, reminder.timezone)}: ${reminder.text}`;
  }

  if (command.type === "list_reminders") {
    const reminders = await repository.listUpcoming(context.userId, context.now);
    if (reminders.length === 0) return "You don’t have any upcoming reminders.";
    return reminders.slice(0, 8).map((reminder, index) =>
      `${index + 1}. ${formatReminderTime(reminder.remindAt, reminder.timezone)} — ${reminder.text}`,
    ).join("\n");
  }

  const result = await repository.cancel({
    userId: context.userId,
    reminderId: command.reminderId,
    reminderQuery: command.reminderQuery,
    now: context.now,
  });
  if (result.kind === "not_found") return "I couldn’t find that upcoming reminder.";
  if (result.kind === "ambiguous") {
    return `Which reminder should I cancel?\n${result.reminders.slice(0, 5).map((reminder, index) => `${index + 1}. ${reminder.text}`).join("\n")}`;
  }
  return `Cancelled: ${result.reminder.text}.`;
}
