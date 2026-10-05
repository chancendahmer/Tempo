import { ReminderCommand } from "./reminder-commands";
import { relativeReminderTime } from "./reminder-commands";

export type ReminderRecord = {
  id: string;
  text: string;
  remindAt: Date;
  timezone: string;
  recurrence: "daily" | "weekdays" | "weekly" | null;
  occurrenceCount: number;
  status: "scheduled" | "sending" | "sent" | "cancelled" | "failed" | "completed";
};

export interface ReminderRepository {
  createMany?(input: { userId: string; sourceMessageId: string; timezone: string; items: Array<{ text: string; remindAt: Date; recurrence?: "daily" | "weekdays" | "weekly"; taskId?: string }> }): Promise<ReminderRecord[]>;
  updateMany?(input: { userId: string; sourceMessageId: string; now: Date; changes: Array<{ reminderId: string; expectedRemindAt: Date; remindAt: Date }> }): Promise<{ kind: "updated"; reminders: ReminderRecord[] } | { kind: "stale" }>;

  update?(input: { userId: string; sourceMessageId: string; reminderId?: string; reminderQuery?: string; remindAt?: Date; now: Date }): Promise<
    | { kind: "updated"; reminder: ReminderRecord }
    | { kind: "not_found" }
    | { kind: "ambiguous"; reminders: ReminderRecord[] }
  >;
  findBySourceMessage(sourceMessageId: string): Promise<ReminderRecord | null>;
  create(input: {
    userId: string;
    sourceMessageId: string;
    text: string;
    remindAt: Date;
    timezone: string;
    recurrence?: "daily" | "weekdays" | "weekly";
    taskId?: string;
  }): Promise<ReminderRecord>;
  listUpcoming(userId: string, now: Date): Promise<ReminderRecord[]>;
  listForRundown(userId: string, start: Date, end: Date): Promise<ReminderRecord[]>;
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

type LocalDateTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function localParts(date: Date, timezone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

export function localDateTimeToUtc(target: LocalDateTime, timezone: string): Date {
  const targetEpoch = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
  let candidate = targetEpoch;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = localParts(new Date(candidate), timezone);
    const actualEpoch = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const adjustment = targetEpoch - actualEpoch;
    if (adjustment === 0) break;
    candidate += adjustment;
  }
  return new Date(candidate);
}

/** Deterministic common dates; leave unspecified/ambiguous times for clarification. */
export function requestedReminderTime(message: string, now: Date, timezone: string): string | undefined {
  const relative = relativeReminderTime(message, now);
  if (relative) return relative;
  const match = message.match(/\btomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!match) return undefined;
  const hour = Number(match[1]), minute = Number(match[2] ?? 0);
  if (hour < 1 || hour > 12 || minute > 59) return undefined;
  const current = localParts(now, timezone);
  const next = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
  const target = {
    year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(),
    hour: hour % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0), minute, second: 0,
  };
  const result = localDateTimeToUtc(target, timezone);
  // Nonexistent DST wall times must not silently move an hour.
  if (JSON.stringify(localParts(result, timezone)) !== JSON.stringify(target)) return undefined;
  return result.toISOString();
}

function addLocalDays(date: Date, timezone: string, days: number): Date {
  const current = localParts(date, timezone);
  const shifted = new Date(Date.UTC(
    current.year,
    current.month - 1,
    current.day + days,
    current.hour,
    current.minute,
    current.second,
  ));
  return localDateTimeToUtc({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  }, timezone);
}

export function nextRecurringOccurrence(
  occurrence: Date,
  timezone: string,
  recurrence: NonNullable<ReminderRecord["recurrence"]>,
  after = occurrence,
): Date {
  let next = occurrence;
  do {
    next = addLocalDays(next, timezone, recurrence === "weekly" ? 7 : 1);
    if (recurrence === "weekdays") {
      while ([0, 6].includes(new Date(Date.UTC(
        localParts(next, timezone).year,
        localParts(next, timezone).month - 1,
        localParts(next, timezone).day,
      )).getUTCDay())) {
        next = addLocalDays(next, timezone, 1);
      }
    }
  } while (next <= after);
  return next;
}

function recurrenceLabel(recurrence: ReminderRecord["recurrence"]): string {
  return recurrence === "daily" ? "Daily" : recurrence === "weekdays" ? "Weekdays" : recurrence === "weekly" ? "Weekly" : "";
}

export async function executeReminderCommand(
  repository: ReminderRepository,
  command: ReminderCommand,
  context: { userId: string; sourceMessageId: string; timezone: string; now: Date; forModel?: boolean },
): Promise<string> {
  if (command.type === "create_reminders") {
    if (!repository.createMany) return "Multiple reminders are temporarily unavailable.";
    if (command.reminders.some(item => new Date(item.remindAt) <= context.now)) return "One of those times has passed. What future date and time should I use? No reminders were added.";
    if (new Set(command.reminders.map(item => item.text.toLowerCase() + ":" + new Date(item.remindAt).toISOString())).size !== command.reminders.length) return "Those include a duplicate reminder. Please choose distinct times.";
    const saved = await repository.createMany({ ...context, items: command.reminders.map(item => ({ ...item, remindAt: new Date(item.remindAt) })) });
    return "Reminders set:\n" + saved.map(item => formatReminderTime(item.remindAt, item.timezone) + " — " + item.text).join("\n");
  }
  if (command.type === "reschedule_reminders") {
    if (!repository.updateMany) return "Multiple reminder updates are temporarily unavailable.";
    if (command.changes.some(item => new Date(item.remindAt) <= context.now) || new Set(command.changes.map(item => item.reminderId)).size !== command.changes.length) return "Please choose distinct reminders and future times. Nothing was changed.";
    const result = await repository.updateMany({ ...context, changes: command.changes.map(item => ({ ...item, expectedRemindAt: new Date(item.expectedRemindAt), remindAt: new Date(item.remindAt) })) });
    if (result.kind === "stale") return "Those reminders changed or are no longer editable. Please let me check them again. Nothing was changed.";
    return "Reminders moved:\n" + result.reminders.map(item => formatReminderTime(item.remindAt, item.timezone) + " — " + item.text).join("\n");
  }
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
      recurrence: command.recurrence,
      taskId: command.taskId,
    });
    const prefix = reminder.recurrence ? `${recurrenceLabel(reminder.recurrence)} reminder starts` : "Reminder set for";
    return `${prefix} ${formatReminderTime(reminder.remindAt, reminder.timezone)}: ${reminder.text}`;
  }

  if (command.type === "list_reminders") {
    const reminders = await repository.listUpcoming(context.userId, context.now);
    if (context.forModel) return JSON.stringify({ items: reminders, limit: 50, truncated: reminders.length >= 50 });
    if (reminders.length === 0) return "You don’t have any upcoming reminders.";
    return reminders.slice(0, 8).map((reminder, index) =>
      `${index + 1}. ${reminder.recurrence ? `${recurrenceLabel(reminder.recurrence)}, next ` : ""}${formatReminderTime(reminder.remindAt, reminder.timezone)} — ${reminder.text}`,
    ).join("\n");
  }

  if (command.type === "reschedule_reminder" || command.type === "complete_reminder") {
    if (!repository.update) return "Reminder updates are temporarily unavailable.";
    const remindAt = command.type === "reschedule_reminder" ? new Date(command.remindAt) : undefined;
    if (remindAt && (!Number.isFinite(remindAt.getTime()) || remindAt <= context.now)) return "That time has already passed. What future date and time should I use?";
    const result = await repository.update({ ...context, reminderId: command.reminderId, reminderQuery: command.reminderQuery, remindAt });
    if (result.kind === "not_found") return "I couldn’t find an editable reminder with that description.";
    if (result.kind === "ambiguous") return `Please send the change again with a more specific reminder title: ${result.reminders.map((item) => item.text).join("; ")}.`;
    return remindAt ? `Reminder moved to ${formatReminderTime(result.reminder.remindAt, result.reminder.timezone)}: ${result.reminder.text}` : `Completed reminder: ${result.reminder.text}.`;
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
