import { z } from "zod";
import type { AssistantIntegrations } from "./assistant-commands";
import type { TaskRepository } from "./task-service";
import type { GoalRepository } from "./goal-service";
import type { LifeItem } from "./life-items";
import { ingredientLabel } from "./meal-groceries";
import { isSensitiveMemory } from "./memory-service";
import { nutrientKeys, nutritionTotals } from "./nutrition-totals";
import { localDateTimeToUtc, nextRecurringOccurrence, formatReminderTime, type ReminderRepository } from "./reminder-service";

export const rundownIncludeSections = ["food", "shopping", "workoutPlans", "thoughts"] as const;
const includeSchema = z.array(z.enum(rundownIncludeSections)).min(1).max(rundownIncludeSections.length)
  .refine(sections => new Set(sections).size === sections.length, "Choose each section once.");
export const rundownRequestSchema = z.object({ startDate: z.iso.date(), days: z.number().int().min(1).max(7), include: includeSchema.optional() });
export type RundownRequest = z.infer<typeof rundownRequestSchema>;
export type RundownIncludeSection = typeof rundownIncludeSections[number];
export type WorkspaceRundownOptions = { include: readonly RundownIncludeSection[]; currentDate: string };
type Food = Extract<LifeItem, { kind: "food" }>;
type Stock = Extract<LifeItem, { kind: "pantry" }>;
export type RundownRows<T> = { items: T[]; truncated: boolean };
type RundownStock = { title: string; quantity: Stock["quantity"] | null; unit: Stock["unit"] | null };
export type RundownDetails = {
  food?: RundownRows<Pick<Food, "title" | "date" | "meal" | typeof nutrientKeys[number]>> | null;
  groceries?: RundownRows<RundownStock & { checked: boolean; mealDerived: boolean }> | null;
  pantry?: RundownRows<RundownStock> | null;
  derivedShoppingUnavailable?: true;
  workoutPlans?: RundownRows<{ title: string; sessions: Array<{ name: string; minutes: number }>; moreSessions: boolean }> | null;
  thoughts?: RundownRows<{ title: string; preview: string; previewTruncated: boolean }> | null;
};
export type WorkspaceRundown = {
  items: Array<{ id: string; data: Extract<LifeItem, { kind: "routine" | "meal" | "workout" }> }>;
  truncated: boolean;
  unavailable?: true;
  details?: RundownDetails;
};
export interface WorkspaceRundownSource {
  listForRundown(userId: string, startDate: string, endDateExclusive: string, options?: WorkspaceRundownOptions): Promise<WorkspaceRundown>;
}
export function isRundownQuestion(message: string): boolean {
  return /\b(rundown|overview|summary|agenda)\b/i.test(message)
    || (/\b(show|list|what|give|tell)\b/i.test(message)
      && /\b(today|tomorrow|day|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(message));
}
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
  rundownRequestSchema.parse(request);
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
  const parsed = rundownRequestSchema.safeParse({ startDate, days });
  return parsed.success ? parsed.data : null;
}

export const RUNDOWN_HISTORY_LIMIT = "This is your current open plan, not a history of completed tasks, delivered reminders or calendar edits.";

export async function buildRundown(
  repositories: { tasks: Pick<TaskRepository, "list">; goals: Pick<GoalRepository, "list">; reminders?: Pick<ReminderRepository, "listForRundown">; integrations?: Pick<AssistantIntegrations, "agenda">; workspace?: WorkspaceRundownSource },
  context: { userId: string; timezone: string; now: Date },
  request: RundownRequest,
): Promise<string> {
  const { start, end } = rundownRange(request, context.timezone);
  const results = await Promise.allSettled([
    repositories.tasks.list(context.userId, "open"),
    repositories.goals.list(context.userId, "active"),
    repositories.reminders ? repositories.reminders.listForRundown(context.userId, start, end) : Promise.reject(new Error("unavailable")),
    repositories.integrations ? repositories.integrations.agenda(context.userId, start.toISOString(), end.toISOString()) : Promise.reject(new Error("unavailable")),
    repositories.workspace ? repositories.workspace.listForRundown(context.userId, request.startDate, shiftDate(request.startDate, request.days),
      ...(request.include ? [{ include: request.include, currentDate: localDate(context.now, context.timezone) }] : [])) : Promise.reject(new Error("unavailable")),
  ]);
  const [taskResult, goalResult, reminderResult, calendarResult, workspaceResult] = results;
  const sections: string[] = [`${request.days === 1 ? "Daily" : request.days === 7 ? "Weekly" : "Upcoming"} rundown · ${request.startDate}${request.days > 1 ? ` – ${shiftDate(request.startDate, request.days - 1)}` : ""} (${context.timezone})`];
  const line = (text: string, max = 240) => text.replace(/[\r\n]+/g, " ").slice(0, max);
  const section = (title: string, items: string[], empty = "None.", limit = 12) => {
    sections.push(`${title}\n${items.length ? items.slice(0, limit).map(item => `• ${item}`).join("\n") : empty}${items.length > limit ? `\n+ ${items.length - limit} more; ask for a shorter date range or check the app.` : ""}`);
  };
  const calendarUnavailable = "Calendar unavailable; connection status and events were not verified. Check Extensions for Google Calendar.";
  if (calendarResult.status === "fulfilled") {
    const parsed = calendarSchema.safeParse((() => { try { return JSON.parse(calendarResult.value); } catch { return null; } })());
    if (parsed.success) {
      section("Calendar · current Google agenda", parsed.data.events.map(event => `${event.start.dateTime ? formatReminderTime(new Date(event.start.dateTime), context.timezone) : `${event.start.date ?? "Unknown date"} · all day`} — ${line(event.title)}`));
      if (parsed.data.truncated) sections.push("Calendar has more events than returned here; check Google Calendar for the full list.");
    } else sections.push(calendarUnavailable);
  } else sections.push(calendarUnavailable);
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
  if (workspaceResult.status === "fulfilled" && !workspaceResult.value.unavailable) {
    const items = workspaceResult.value.items;
    const today = localDate(context.now, context.timezone);
    const includesToday = request.startDate <= today && today < shiftDate(request.startDate, request.days);
    section("Routines · daily templates", items.flatMap(({ data }) => {
      if (data.kind !== "routine") return [];
      const progress = includesToday ? `${data.steps.filter(step => step.completedOn === today).length}/${data.steps.length} steps done today` : "daily template; past/future completion not inferred";
      const next = includesToday ? data.steps.find(step => step.completedOn !== today) : undefined;
      return [`${data.time} · ${data.period} — ${line(data.title)} (${progress})${next ? `; next: ${line(next.title)}` : ""}`];
    }), "No saved routines.");
    section("Meals · planned, not logged as eaten", items.flatMap(({ data }) => data.kind === "meal" ? [`${data.date} · ${data.meal} — ${line(data.title)}${data.servings ? ` (${data.servings} serving${data.servings === 1 ? "" : "s"})` : ""}`] : []), "No meal plans saved in this range.");
    section("Movement · logged activity", items.flatMap(({ data }) => data.kind === "workout" ? [`${data.date} — ${line(data.title)} · ${data.minutes} min (${data.activity})`] : []), "No activity logged in this range; this does not mean you were inactive.");
    if (workspaceResult.value.truncated) sections.push("More routines, meal plans or activity logs exist in this range; check the app for the complete records.");
  } else if (repositories.workspace) sections.push("Routines, meals and activity unavailable; these saved records have not been checked.");
  if (request.include) {
    const details = workspaceResult.status === "fulfilled" ? workspaceResult.value.details : undefined;
    const label = (item: RundownStock) => ingredientLabel({ title: line(item.title, 100), quantity: item.quantity ?? undefined, unit: item.unit ?? undefined });
    const detail = <T>(title: string, records: RundownRows<T> | null | undefined, render: (item: T) => string, empty: string) => {
      if (!records) { sections.push(`${title} unavailable; these records have not been checked.`); return; }
      section(title, records.items.map(render), empty, 6);
      if (records.truncated) sections.push(`More ${title.toLowerCase()} records exist; this list is incomplete.`);
    };
    if (request.include.includes("food")) {
      const food = details?.food;
      detail("Food logs · consumed, not planned", food, item => `${item.date} · ${item.meal} — ${line(item.title, 100)} · ${item.calories === null ? "calories unknown" : `${item.calories} kcal`}, ${item.protein === null ? "protein unknown" : `${item.protein} g protein`}`, "No food logged in this range.");
      if (food?.items.length) {
        const totals = nutritionTotals(food.items.map(data => ({ data })));
        const amounts = nutrientKeys.map(key => {
          const { value, missing } = totals[key];
          return `${key}: ${value === null ? "unknown" : `${Number(value.toPrecision(12))} ${key === "calories" ? "kcal" : "g"}`}${missing ? ` (${missing} log${missing === 1 ? "" : "s"} missing)` : ""}`;
        });
        sections.push(`${food.truncated ? "Known totals for included logs only" : "Known logged totals for this range"} · ${amounts.join("; ")}.`);
      }
    }
    if (request.include.includes("shopping")) {
      detail("Saved shopping · purchased checks are not stock", details?.groceries,
        item => `${label(item)} · ${item.checked ? "checked purchased" : "to buy"} · ${item.mealDerived ? "meal-derived" : "manual"}`,
        details?.derivedShoppingUnavailable || details?.groceries?.truncated ? "No verified grocery items in this partial view." : "No saved grocery items.");
      if (details?.derivedShoppingUnavailable) sections.push("Meal-derived shopping unavailable; the current plan need has not been verified.");
      detail("Pantry · explicitly recorded stock", details?.pantry, label, "No pantry stock recorded.");
    }
    if (request.include.includes("workoutPlans")) {
      detail("Workout plans · planned sessions, not activity logs", details?.workoutPlans, item =>
        `${line(item.title, 100)} — ${item.sessions.map(session => `${line(session.name, 75)} (${session.minutes} min planned)`).join(", ")}${item.moreSessions ? "; more sessions in this plan" : ""}`, "No workout plans saved.");
    }
    if (request.include.includes("thoughts")) {
      detail("Thoughts · saved notes, not tasks", details?.thoughts, item => {
        if (isSensitiveMemory(item.title)) return "Private thought";
        const title = Array.from(item.title.replace(/[\r\n]+/g, " ")).slice(0, 100).join("");
        if (!item.preview || isSensitiveMemory(item.preview)) return title;
        return `${title} — ${Array.from(item.preview.replace(/[\r\n]+/g, " ")).slice(0, 160).join("")}${item.previewTruncated ? "…" : ""}`;
      }, "No Thoughts saved.");
    }
  }
  if (start < context.now) sections.push(RUNDOWN_HISTORY_LIMIT);
  return sections.join("\n\n");
}
