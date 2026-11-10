import { z } from "zod";
import { localDay } from "../../server/domain/life-items";

const boundary = z.object({ dateTime: z.iso.datetime({ offset: true }).optional(), date: z.iso.date().optional() });
export const calendarEventSchema = z.object({ id: z.string(), title: z.string(), start: boundary, end: boundary, editable: z.boolean() }).refine(event =>
  event.start.date ? !!event.end.date && event.end.date > event.start.date : !!event.start.dateTime && !!event.end.dateTime && Date.parse(event.end.dateTime) >= Date.parse(event.start.dateTime),
  "Calendar event dates are incomplete or invalid.",
);
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

/** Google uses an exclusive end date for all-day events and exclusive end time for timed events. */
export function calendarEventOccursOnDay(event: CalendarEvent, day: string, timezone: string) {
  if (event.start.date) return event.start.date <= day && !!event.end.date && event.end.date > day;
  if (!event.start.dateTime || !event.end.dateTime) return false;
  const start = Date.parse(event.start.dateTime), end = Date.parse(event.end.dateTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return false;
  // A zero-duration event belongs to its start day, but never counts as ongoing.
  return localDay(new Date(start), timezone) <= day && localDay(new Date(end > start ? end - 1 : end), timezone) >= day;
}
