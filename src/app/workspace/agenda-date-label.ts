import { localDay } from "../../server/domain/life-items";

export function agendaDateLabel(value: string, timezone: string, now: Date) {
  const date = new Date(value);
  const day = localDay(date, timezone);
  const today = localDay(now, timezone);
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  if (day === today) return "Today";
  if (day === next.toISOString().slice(0, 10)) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, weekday: "short", month: "short", day: "numeric" }).format(date);
}
