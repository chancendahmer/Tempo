import { z } from "zod";
import type { AssistantIntegrations } from "./assistant-commands";
import type { TaskRepository } from "./task-service";
import type { GoalRepository } from "./goal-service";
import { localDateTimeToUtc, nextRecurringOccurrence, formatReminderTime, type ReminderRepository } from "./reminder-service";

export type RundownRequest = { startDate: string; days: number };
export function isRundownQuestion(message: string): boolean {
  return /\b(rundown|overview|summary|agenda)\b/i.test(message)
    || (/\b(show|list|what|give|tell)\b/i.test(message)
      && /\b(today|tomorrow|day|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(message));
}
const requestSchema = z.object({ startDate: z.iso.date(), days: z.number().int().min(1).max(7) });
const calendarSchema = z.object({
  events: z.array(z.object({
    title: z.string(),
    start: z.object({ dateTime: z.iso.datetime({ offset: true }).optional(), date: z.iso.date().optional() }),
    end: z.object({ dateTime: z.iso.datetime({ offset: true }).optional(), date: z.iso.date().optional() }).optional(),
  })),
  truncated: z.boolean().optional(),
});

export function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function rundownRange(request: RundownRequest, timezone: string) {
  requestSchema.parse(request);
  const midnight = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    return localDateTimeToUtc({ year, month, day, hour: 0, minute: 0, second: 0 }, timezone);
  };
  return { start: midnight(request.startDate), end: midnight(shiftDate(request.startDate, request.days)) };
}

/** A deliberately narrow shortcut also works when the model is unavailable. */
export function parseRundownRequest(message: string, now: Date, timezone: string): RundownRequest | null {
  const text = message.trim().replace(/[?!.]+$/, "");
  // Only consume a complete read request. Mixed writes continue to the model.
  const remaining = text.match(/^(?:(?:please )?(?:give|show|send) me (?:(?:my|a|the) )?(?:rundown|overview|summary|agenda) for |what do i have )(?:(tomorrow) and (?:for )?)?(?:the )?rest of (?:this|the) week(?:[?!.]?\s+include (?:my )?(?:tasks|goals|reminders|calendar|plans|and|,|\s)+)?$/i);
  if (remaining) {
    const today = localDate(now, timezone);
    const offset = remaining[1] ? 1 : 0;
    const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
    // On Sunday, "tomorrow and the rest of this week" spans two weeks;
    // leave the ambiguity for a clarification rather than silently rolling it.
    if (weekday + offset > 6) return null;
    return { startDate: shiftDate(today, offset), days: 7 - weekday - offset };
  }
  const match = text.match(/^(?:(?:please )?(?:give|show|send) me )?(?:(?:my|a|the) )?(?:(daily|weekly) )?(?:rundown|overview|summary|agenda)(?: (?:for|of))?(?: (today|tomorrow|this week|next week|\d{4}-\d{2}-\d{2}))?$/i)
    ?? text.match(/^what(?:'s| is| does) my (day|week)(?: look like)?$/i);
  if (!match) return null;
  const period = (match[1] ?? "").toLowerCase();
  const when = (match[2] ?? "").toLowerCase();
  const today = localDate(now, timezone);
  let startDate = when.match(/^\d{4}/) ? when : today;
  const days = /week/.test(`${period} ${when}`) ? 7 : 1;
  if (when === "tomorrow") startDate = shiftDate(today, 1);
  if (when.includes("week") || (days === 7 && !when)) {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    startDate = shiftDate(today, -((weekday + 6) % 7) + (when === "next week" ? 7 : 0));
  }
  const parsed = requestSchema.safeParse({ startDate, days });
  return parsed.success ? parsed.data : null;
}

export const RUNDOWN_HISTORY_LIMIT = "This is your current open plan, not a history of completed tasks, delivered reminders or calendar edits.";

export async function buildRundown(
  repositories: { tasks: Pick<TaskRepository, "list">; goals: Pick<GoalRepository, "list">; reminders?: Pick<ReminderRepository, "listForRundown">; integrations?: Pick<AssistantIntegrations, "agenda"> },
  context: { userId: string; timezone: string; now: Date },
  request: RundownRequest,
): Promise<string> {
  const { start, end } = rundownRange(request, context.timezone);
  const results = await Promise.allSettled([
    repositories.tasks.list(context.userId, "open"),
    repositories.goals.list(context.userId, "active"),
    repositories.reminders ? repositories.reminders.listForRundown(context.userId, start, end) : Promise.reject(new Error("unavailable")),
    repositories.integrations ? repositories.integrations.agenda(context.userId, start.toISOString(), end.toISOString()) : Promise.reject(new Error("unavailable")),
  ]);
  const [taskResult, goalResult, reminderResult, calendarResult] = results;
  const sections: string[] = [`${request.days === 1 ? "Daily" : request.days === 7 ? "Weekly" : "Upcoming"} rundown · ${request.startDate}${request.days > 1 ? ` – ${shiftDate(request.startDate, request.days - 1)}` : ""} (${context.timezone})`];
  const line = (text: string) => text.replace(/[\r\n]+/g, " ").slice(0, 240);
  const section = (title: string, items: string[], empty = "None.") => {
    sections.push(`${title}\n${items.length ? items.slice(0, 12).map(item => `• ${item}`).join("\n") : empty}${items.length > 12 ? `\n+ ${items.length - 12} more; ask for a shorter date range or check the app.` : ""}`);
  };
  if (calendarResult.status === "fulfilled") {
    const parsed = calendarSchema.safeParse((() => { try { return JSON.parse(calendarResult.value); } catch { return null; } })());
    if (parsed.success) {
      section("Calendar · current Google agenda", parsed.data.events.map(event => `${event.start.dateTime ? formatReminderTime(new Date(event.start.dateTime), context.timezone) : `${event.start.date ?? "Unknown date"} · all day`} — ${line(event.title)}`));
      if (parsed.data.truncated) sections.push("Calendar has more events than returned here; check Google Calendar for the full list.");
    } else sections.push("Calendar unavailable; your schedule has not been verified.");
  } else sections.push("Calendar unavailable or not connected. Check Extensions to connect/reconnect Google Calendar; this does not mean your calendar is empty.");
  if (reminderResult.status === "fulfilled") {
    const reminders: { at: Date; text: string }[] = [];
    for (const reminder of reminderResult.value.slice(0, 100)) {
      let at = reminder.remindAt;
      if (at < start && reminder.recurrence) {
        // Jump by local dates before using the recurrence helper; distant weeks
        // must not require one iteration per intervening day.
        const firstDate = localDate(at, reminder.timezone);
        const startDate = localDate(start, reminder.timezone);
        const gap = Math.floor((Date.parse(startDate) - Date.parse(firstDate)) / 86400000);
        const stride = reminder.recurrence === "weekly" ? 7 : 1;
        const jump = Math.max(0, Math.floor(gap / stride) * stride - stride);
        if (jump) {
          const [year, month, day] = shiftDate(firstDate, jump).split("-").map(Number);
          const parts = new Intl.DateTimeFormat("en-US", { timeZone: reminder.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(at);
          const part = (type: string) => Number(parts.find(p => p.type === type)!.value);
          at = localDateTimeToUtc({ year, month, day, hour: part("hour"), minute: part("minute"), second: part("second") }, reminder.timezone);
        }
        at = nextRecurringOccurrence(at, reminder.timezone, reminder.recurrence, new Date(start.getTime() - 1));
      }
      for (let count = 0; count < 8 && at >= start && at < end; count++) {
        reminders.push({ at, text: `${formatReminderTime(at, context.timezone)} — ${line(reminder.text)}${reminder.recurrence ? ` (${reminder.recurrence}; planned)` : ""}` });
        if (!reminder.recurrence) break;
        at = nextRecurringOccurrence(at, reminder.timezone, reminder.recurrence);
      }
    }
    section("Reminders · pending / planned", reminders.sort((a, b) => +a.at - +b.at).map(r => r.text), "No pending reminders in this range.");
    if (reminderResult.value.length > 100) sections.push("Reminder results are limited to 100 series; this list is incomplete.");
  } else sections.push("Reminders unavailable; try again later.");
  if (taskResult.status === "fulfilled") {
    const tasks = taskResult.value;
    section("Tasks due", tasks.filter(t => t.dueAt && t.dueAt >= start && t.dueAt < end).sort((a, b) => +a.dueAt! - +b.dueAt!).map(t => `${formatReminderTime(t.dueAt!, context.timezone)} — ${line(t.title)}`));
    section("Overdue · still open", tasks.filter(t => t.dueAt && t.dueAt < start && t.dueAt < context.now).map(t => line(t.title)));
    section("Tasks · no due date", tasks.filter(t => !t.dueAt).map(t => line(t.title)));
  } else sections.push("Tasks unavailable; try again later.");
  if (goalResult.status === "fulfilled") section("Goals · ongoing, not scheduled", goalResult.value.map(g => line(g.title)));
  else sections.push("Goals unavailable; try again later.");
  if (start < context.now) sections.push(RUNDOWN_HISTORY_LIMIT);
  return sections.join("\n\n");
}
