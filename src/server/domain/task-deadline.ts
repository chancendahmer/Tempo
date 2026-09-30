import { localDateTimeToUtc } from "./reminder-service";
import type { TaskCommand } from "./task-commands";

/** Resolve only an explicit today/tomorrow + clock in the account's timezone. */
export function normalizeTaskDeadline(command: TaskCommand, message: string, now: Date, timezone: string): TaskCommand {
  if (command.type !== "create_task" && command.type !== "update_task") return command;
  if (command.type === "update_task" && command.patch.dueAt === null) return command;
  // An explicitly named alternate zone requires contextual interpretation.
  if (/\b(?:UTC|GMT|EST|EDT|PST|PDT|CST|CDT|MST|MDT|eastern|pacific|central|mountain)\b/i.test(message)) return command;
  const matches = [...message.matchAll(/\b(today|tomorrow)\s+(?:at|by)\s+(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/gi)];
  if (matches.length !== 1) return command;
  const match = matches[0], hour = Number(match[2]), minute = Number(match[3] ?? 0);
  if (hour < 1 || hour > 12 || minute > 59) return command;
  const dateParts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const part = (name: string) => Number(dateParts.find(p => p.type === name)?.value);
  const day = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + (match[1].toLowerCase() === "tomorrow" ? 1 : 0)));
  const target = { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour: hour % 12 + (match[4].toLowerCase() === "p" ? 12 : 0), minute, second: 0 };
  const due = localDateTimeToUtc(target, timezone);
  const roundTrip = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(due);
  if (Object.entries(target).some(([key, value]) => key !== "second" && Number(roundTrip.find(p => p.type === key)?.value) !== value)) return command;
  // A repeated fall-back hour is ambiguous even when its wall-clock round trip matches.
  const clock = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(date);
  if ([-60, 60].some(offset => clock(new Date(due.getTime() + offset * 60_000)) === clock(due))) return command;
  const dueAt = due.toISOString();
  return command.type === "create_task" ? { ...command, dueAt } : { ...command, patch: { ...command.patch, dueAt } };
}
