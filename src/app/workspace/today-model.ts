import { localDay, type SavedLifeItem } from "../../server/domain/life-items";
import type { Workspace } from "./workspace-data";

type TodayEvent = { id: string; at: string; endsAt?: string; title: string; detail: string; kind: "task" | "reminder" | "calendar"; ongoing: boolean };

/** Account-local routine windows. Manual tab selection is owned by the view. */
export function todayModel(data: Workspace, now: Date) {
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
  const tasks = data.tasks.filter(task => !["completed", "abandoned"].includes(task.status));
  const available = tasks.filter(task => !task.dueAt || localDay(new Date(task.dueAt), data.timezone) <= day);
  const nextTask = tasks.find(task => task.id === focus?.taskId) ?? tasks.find(task => task.status === "in_progress") ?? [...available].sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity))[0];
  const events: TodayEvent[] = [
    ...tasks.filter(t => t.dueAt && localDay(new Date(t.dueAt), data.timezone) === day).map(t => ({ id: t.id, at: t.dueAt!, title: t.title, detail: `${t.estimatedMinutes ?? 25} min`, kind: "task" as const, ongoing: false })),
    ...data.reminders.filter(r => ["scheduled", "sending"].includes(r.status) && localDay(new Date(r.remindAt), data.timezone) === day).map(r => ({ id: r.id, at: r.remindAt, title: r.text, detail: "Reminder", kind: "reminder" as const, ongoing: false })),
    ...data.busy.filter(b => localDay(new Date(b.startsAt), data.timezone) <= day && localDay(new Date(b.endsAt), data.timezone) >= day).map(b => ({ id: b.id, at: b.startsAt, endsAt: b.endsAt, title: data.demoCalendarEvents?.find(event => event.id === b.id)?.title ?? "Calendar time", detail: "Open Calendar for event details", kind: "calendar" as const, ongoing: Date.parse(b.startsAt) <= now.getTime() && Date.parse(b.endsAt) > now.getTime() })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { day, routine, activeRoutine, nextTask, tasks, events, focus };
}
