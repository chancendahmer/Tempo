import { localDay, type SavedLifeItem } from "../../server/domain/life-items";
import { calendarEventOccursOnDay, type CalendarEvent } from "./calendar-event-model";
import type { Workspace } from "./workspace-data";

type TodayEvent = { id: string; at: string; endsAt?: string; allDay?: boolean; title: string; detail: string; kind: "task" | "reminder" | "calendar"; ongoing: boolean };
const taskOrder = { focused: 0, started: 1, today: 2, overdue: 3, undated: 4, future: 5 };

/** Account-local routine windows. Manual tab selection is owned by the view. */
export function todayModel(data: Workspace, now: Date, calendarEvents?: CalendarEvent[]) {
  const day = localDay(now, data.timezone);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: data.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const minute = Number(parts.find(p => p.type === "hour")?.value) * 60 + Number(parts.find(p => p.type === "minute")?.value);
  const routines = data.items.filter((item): item is SavedLifeItem & { data: Extract<SavedLifeItem["data"], { kind: "routine" }> } => item.data.kind === "routine");
  const distance = (item: typeof routines[number]) => {
    const [h, m] = item.data.time.split(":").map(Number);
    return (minute - h * 60 - m + 1440) % 1440;
  };
  const scheduled = [...routines].sort((a, b) => distance(a) - distance(b));
  const focusItem = data.items.find(item => item.data.kind === "focus");
  const focus = focusItem?.data.kind === "focus" ? focusItem.data : undefined;
  // A persisted session stays current even when its routine window has ended.
  const activeRoutine = focus ? routines.find(item => item.id === focus.routineId) : scheduled.find(item => distance(item) < 120 && item.data.steps.some(step => step.completedOn !== day));
  const routine = activeRoutine ?? scheduled[0];
  const rankedTasks = data.tasks.filter(task => !["completed", "abandoned"].includes(task.status)).map(task => {
    const due = task.dueAt ? new Date(task.dueAt) : null;
    const dueDay = due ? localDay(due, data.timezone) : null;
    const rank = task.id === focus?.taskId ? taskOrder.focused
      : task.status === "in_progress" ? taskOrder.started
      : !dueDay ? taskOrder.undated
      : dueDay === day ? taskOrder.today
      : dueDay < day ? taskOrder.overdue : taskOrder.future;
    // Keep existing session order and use newest deadlines first for overdue work.
    const timestamp = rank >= taskOrder.today && due ? due.getTime() : 0;
    return { task, dueDay, rank, timeOrder: rank === taskOrder.overdue ? -timestamp : timestamp };
  }).sort((a, b) => a.rank - b.rank || a.timeOrder - b.timeOrder);
  const first = rankedTasks[0];
  const nextTask = first?.rank === taskOrder.future ? undefined : first?.task;
  const tasks = rankedTasks.map(({ task }) => task);
  const calendar: CalendarEvent[] = calendarEvents ?? data.busy.map(b => ({ id: b.id, start: { dateTime: b.startsAt }, end: { dateTime: b.endsAt }, editable: false, title: data.demoCalendarEvents?.find(event => event.id === b.id)?.title ?? "Calendar time" }));
  const events: TodayEvent[] = [
    ...rankedTasks.filter(({ dueDay }) => dueDay === day).map(({ task }) => ({ id: task.id, at: task.dueAt!, title: task.title, detail: `${task.estimatedMinutes ?? 25} min`, kind: "task" as const, ongoing: false })),
    ...data.reminders.filter(r => ["scheduled", "sending"].includes(r.status) && localDay(new Date(r.remindAt), data.timezone) === day).map(r => ({ id: r.id, at: r.remindAt, title: r.text, detail: "Reminder", kind: "reminder" as const, ongoing: false })),
    ...calendar.filter(event => calendarEventOccursOnDay(event, day, data.timezone)).map(event => ({ id: event.id, at: event.start.date ?? event.start.dateTime!, endsAt: event.end.date ?? event.end.dateTime, allDay: !!event.start.date, title: event.title, detail: "Google Calendar", kind: "calendar" as const, ongoing: !event.start.date && Date.parse(event.start.dateTime!) <= now.getTime() && Date.parse(event.end.dateTime!) > now.getTime() })),
  ].sort((a, b) => Number(!!("allDay" in b && b.allDay)) - Number(!!("allDay" in a && a.allDay)) || Date.parse(a.at) - Date.parse(b.at));
  return { day, routine, activeRoutine, nextTask, tasks, events, focus };
}
