import { latestLinkedExchange, type ConversationHistoryMessage } from "./conversation-history";
import { relativeReminderTime, type ReminderCommand } from "./reminder-commands";

export function requestedClocks(text: string): number[] {
  const clocks = [...text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/gi)].flatMap(match => {
    const hour = Number(match[1]), minute = Number(match[2] ?? 0);
    return hour >= 1 && hour <= 12 && minute < 60 ? [hour % 12 * 60 + (match[3].toLowerCase() === "p" ? 720 : 0) + minute] : [];
  });
  if (/\bnoon\b/i.test(text)) clocks.push(720);
  if (/\bmidnight\b/i.test(text)) clocks.push(0);
  return [...new Set(clocks)];
}

export function localDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (key: string) => parts.find(item => item.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** Quoted reminder text is payload, not a second set of scheduling constraints. */
export function reminderScheduleText(text: string) {
  return text.replace(/"[^"\n]*"|“[^”\n]*”/g, " ");
}

export function localTimeContext(now: Date, timezone: string) {
  const today = localDate(now, timezone);
  return { timezone, localNow: new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "long" }).format(now),
    today, tomorrow: new Date(new Date(today + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10) };
}
function datesIn(text: string, anchor: Date, timezone: string): string[] {
  const current = new Date(localDate(anchor, timezone) + "T12:00:00Z");
  const day = (offset: number) => new Date(current.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const explicit = [...text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/gi)].map(match => `${match[3] ?? current.getUTCFullYear()}-${String(months.indexOf(match[1].toLowerCase()) + 1).padStart(2,"0")}-${match[2].padStart(2,"0")}`);
  if (explicit.length) return [...new Set(explicit)];
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  // A named weekday with a day-of-month means that calendar date, not the
  // first occurrence of that weekday. Keep inconsistent pairs unexecutable.
  const ordinal = text.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i);
  if (ordinal) {
    const candidate = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), Number(ordinal[2]), 12));
    if (candidate < current) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
    if (candidate.getUTCDate() !== Number(ordinal[2]) || candidate.getUTCDay() !== weekdays.indexOf(ordinal[1].toLowerCase())) return ["inconsistent-weekday-date"];
    return [candidate.toISOString().slice(0, 10)];
  }
  const dates = [...text.matchAll(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi)].map(match => day((weekdays.indexOf(match[1].toLowerCase()) - current.getUTCDay() + 7) % 7));
  if (/\btomorrow\b/i.test(text)) dates.push(day(1));
  else if (/\b(?:today|tonight)\b/i.test(text)) dates.push(day(0));
  return [...new Set(dates)];
}

/** Validate explicit constraints before executing. This is a scheduling check,
 * not write permission. Unknown time wording is left for the model to clarify. */
export function reminderTimeIssue(command: ReminderCommand, input: { message: string; now: Date; timezone: string; history?: ConversationHistoryMessage[]; inheritSchedule?: boolean }): string | undefined {
  if (!["create_reminder", "create_reminders", "reschedule_reminder", "reschedule_reminders"].includes(command.type)) return;
  input = { ...input, message: reminderScheduleText(input.message), history: input.history?.map(item => ({ ...item, content: reminderScheduleText(item.content) })) };
  const exchange = latestLinkedExchange(input.history);
  const editing = command.type === "reschedule_reminder" || command.type === "reschedule_reminders";
  // In a move "from 5 PM to 12 PM", the source clock is not a permitted target.
  const targetClause = input.message.split(/\bto\b/i).at(-1) ?? "";
  const currentClocks = requestedClocks(editing && requestedClocks(targetClause).length ? targetClause : input.message);
  if (editing && currentClocks.length > 1) {
    if (command.type !== "reschedule_reminders" || command.changes.length !== currentClocks.length
      || new Set(command.changes.map(item => localDate(new Date(item.expectedRemindAt), input.timezone))).size !== 1) {
      return "Which new time belongs to each reminder? Please pair each day with its time.";
    }
    // Same-day reminders have a natural chronological order. Reject swapped or
    // duplicate assignments instead of trusting a model's arbitrary ID ordering.
    const ordered = [...command.changes].sort((a,b) => new Date(a.expectedRemindAt).getTime() - new Date(b.expectedRemindAt).getTime());
    const proposed = ordered.map(item => {
      const parts = new Intl.DateTimeFormat("en-GB", {timeZone:input.timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(item.remindAt)).split(":").map(Number);
      return parts[0]*60+parts[1];
    });
    if (JSON.stringify(proposed) !== JSON.stringify([...currentClocks].sort((a,b)=>a-b))) return "Which new time belongs to each reminder? Nothing was changed.";
  }
  const previous = input.inheritSchedule ? exchange?.request : undefined;
  const clocks = currentClocks.length ? currentClocks : requestedClocks(previous?.content ?? "");
  const currentDates = datesIn(input.message, input.now, input.timezone);
  const dates = currentDates.length ? currentDates : previous ? datesIn(previous.content, previous.createdAt, input.timezone) : [];
  const texts = input.message + " " + (previous?.content ?? "");
  if (!clocks.length && /\b(morning|afternoon|evening|tonight)\b/i.test(texts)) return "What time would you like that reminder?";
  const times = command.type === "create_reminders" ? command.reminders.map(item => item.remindAt)
    : command.type === "reschedule_reminders" ? command.changes.map(item => item.remindAt)
    : "remindAt" in command ? [command.remindAt] : [];
  const actualClocks = times.map(time => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: input.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(time)).split(":").map(Number);
    return parts[0] * 60 + parts[1];
  });
  if (clocks.length && actualClocks.some(clock => !clocks.includes(clock))) return "The proposed time does not match your request. What time should I use?";
  if (dates.length && times.some(time => !dates.includes(localDate(new Date(time), input.timezone)))) return "The proposed day does not match your request. Which date should I use?";
  if (command.type === "reschedule_reminders" && command.changes.some(item => localDate(new Date(item.expectedRemindAt), input.timezone) !== localDate(new Date(item.remindAt), input.timezone))) return "I can change both reminder times while keeping their dates. Which dates should these reminders use?";
  if (command.type === "create_reminders") {
    if (clocks.length > 1 && dates.length > 1) return "Please send one date with its times, or several dates with one shared time. Nothing was added.";
    const count = Math.max(clocks.length, dates.length);
    if (count < 2 || times.length < count || times.length > Math.max(1,clocks.length) * Math.max(1,dates.length)) return "Please specify the dates and times for each reminder. Nothing was added.";
    if (new Set(times.map(time => new Date(time).toISOString())).size !== times.length) return "Please choose distinct reminder times. Nothing was added.";
  }
  if (command.type === "create_reminder" && Math.max(clocks.length, dates.length) > 1 && !command.recurrence && !relativeReminderTime(input.message, input.now)) return "Use create_reminders to save all the explicitly requested times together.";
}

export function reminderScheduleConstraints(input: { message: string; now: Date; timezone: string }) {
  const text = reminderScheduleText(input.message);
  return { ...localTimeContext(input.now, input.timezone), dates: datesIn(text, input.now, input.timezone), minutesAfterMidnight: requestedClocks(text) };
}
