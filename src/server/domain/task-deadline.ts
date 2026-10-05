import { localDateTimeToUtc } from "./reminder-service";
import type { TaskCommand } from "./task-commands";

const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(date);
  const part = (name: string) => Number(parts.find(value => value.type === name)?.value);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute"), second: 0 };
}

/** Resolve the user's local constraints, never a model-supplied calendar day. */
export function assessTaskDeadline(command: TaskCommand, message: string, now: Date, timezone: string): { command: TaskCommand; clarification?: string } {
  if (command.type !== "create_task" && command.type !== "update_task") return { command };
  if (command.type === "update_task" && command.patch.dueAt == null) return { command };
  const offsets = [...message.matchAll(/\b(?:UTC|GMT)\s*([+-])(\d{2}):?(\d{2})\b/gi)];
  // Alternate named zones need their own interpretation. Do not silently treat
  // an explicit UTC/EST/etc. time as the account's clock.
  if (!offsets.length && /\b(?:UTC|GMT|EST|EDT|PST|PDT|CST|CDT|MST|MDT|eastern|pacific|central|mountain)\b/i.test(message)) return { command };
  const references = [...message.matchAll(/\b(today|tomorrow|(?:(?:next|this)\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/gi)];
  const isoDates = [...message.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(match => match[0]);
  const monthDates = [...message.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/gi)];
  if (!references.length && !isoDates.length && !monthDates.length) return { command };
  if (/\b\d{1,2}[/-]\d{1,2}\b/.test(message.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ""))) {
    return { command, clarification: "What calendar date should I use? Please spell out the month or use YYYY-MM-DD." };
  }
  const current = localParts(now, timezone);
  const midnight = new Date(Date.UTC(current.year, current.month - 1, current.day));
  if (monthDates.some(match => !match[3] && Date.UTC(current.year, months.indexOf(match[1].toLowerCase()), Number(match[2])) < midnight.getTime())) {
    return { command, clarification: "Which year should I use for that task's calendar date?" };
  }
  const explicitDates = [...new Set([...isoDates, ...monthDates.map(match => {
    const month = months.indexOf(match[1].toLowerCase()) + 1;
    return `${match[3] ?? current.year}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  })])];
  if (explicitDates.length > 1) return { command, clarification: "Which one date should I use for that task?" };
  let day = explicitDates.length ? new Date(`${explicitDates[0]}T00:00:00Z`) : midnight;
  if (Number.isNaN(day.getTime()) || (explicitDates.length && day.toISOString().slice(0, 10) !== explicitDates[0])) return { command, clarification: "What valid calendar date should I use for that task?" };
  const dates = [...new Set(references.map(match => match[0].toLowerCase()))];
  if (!explicitDates.length && dates.length > 1) return { command, clarification: "Which one date should I use for that task?" };
  for (const reference of dates) {
    const relative = new Date(midnight);
    if (reference === "tomorrow") relative.setUTCDate(relative.getUTCDate() + 1);
    else if (reference !== "today") {
      const weekday = weekdays.indexOf(reference.replace(/^(?:next|this)\s+/, ""));
      if (explicitDates.length) {
        if (day.getUTCDay() !== weekday) return { command, clarification: "That weekday and calendar date do not match. Which date should I use?" };
        continue;
      }
      let days = (weekday - relative.getUTCDay() + 7) % 7;
      if (reference.startsWith("next ") && days === 0) days = 7;
      relative.setUTCDate(relative.getUTCDate() + days);
    }
    if (explicitDates.length && relative.getTime() !== day.getTime()) return { command, clarification: "Those date descriptions do not match. Which date should I use?" };
    day = relative;
  }
  const clocks = [...message.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b|\b(?:at|by)\s+(\d{1,2}):(\d{2})(?!\s*[ap]\.?m)\b|\b(noon|midnight)\b/gi)];
  const dueAt = command.type === "create_task" ? command.dueAt : command.patch.dueAt;
  if (clocks.length > 1) return { command, clarification: "What one clock time should I use for that task?" };
  if (!clocks.length) {
    // Date-only tasks keep the existing convention; a model must still respect
    // the requested local calendar date.
    if (dueAt) {
      const actual = localParts(new Date(dueAt), timezone);
      if (actual.year !== day.getUTCFullYear() || actual.month !== day.getUTCMonth() + 1 || actual.day !== day.getUTCDate()) {
        return { command, clarification: "I need to clarify the deadline before saving that task. What date and time should I use?" };
      }
    }
    return { command };
  }
  const clock = clocks[0];
  const rawHour = Number(clock[1] ?? clock[4] ?? (clock[6]?.toLowerCase() === "noon" ? 12 : 0));
  const minute = Number(clock[2] ?? clock[5] ?? 0);
  if (minute > 59 || (clock[3] ? rawHour < 1 || rawHour > 12 : rawHour > 23)) return { command, clarification: "What valid clock time should I use for that task?" };
  const hour = clock[3] ? rawHour % 12 + (clock[3].toLowerCase() === "p" ? 12 : 0) : rawHour;
  const target = { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour, minute, second: 0 };
  let due = localDateTimeToUtc(target, timezone);
  const matches = (date: Date) => JSON.stringify(localParts(date, timezone)) === JSON.stringify(target);
  if (offsets.length) {
    const offset = offsets[0], hours = Number(offset[2]), minutes = Number(offset[3]);
    if (offsets.length !== 1 || hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return { command, clarification: "What one UTC offset should I use, such as UTC-05:00?" };
    due = new Date(Date.UTC(target.year, target.month - 1, target.day, hour, minute) - (offset[1] === "+" ? 1 : -1) * (hours * 60 + minutes) * 60_000);
  } else if (!matches(due)) return { command, clarification: "That local time does not exist because the clocks change. What time should I use instead?" };
  // Include half-hour transitions, not just the common one-hour DST change.
  if (!offsets.length && [-120, -90, -60, -30, 30, 60, 90, 120].some(offset => matches(new Date(due.getTime() + offset * 60_000)))) {
    return { command, clarification: "That local time occurs twice because the clocks change. What time and UTC offset should I use, such as 1:30 AM UTC-05:00?" };
  }
  const resolved = due.toISOString();
  return { command: command.type === "create_task" ? { ...command, dueAt: resolved } : { ...command, patch: { ...command.patch, dueAt: resolved } } };
}

/** Compatibility helper; execution paths must also honor the clarification. */
export function normalizeTaskDeadline(command: TaskCommand, message: string, now: Date, timezone: string): TaskCommand {
  return assessTaskDeadline(command, message, now, timezone).command;
}
