import { describe, expect, it, vi } from "vitest";
import { calendarEventOccursOnDay, calendarEventSchema, type CalendarEvent } from "./calendar-event-model";
import { fetchCalendarEvents } from "./use-calendar-events";

const timed: CalendarEvent = { id: "meeting", title: "Project review", start: { dateTime: "2026-10-15T03:30:00Z" }, end: { dateTime: "2026-10-15T04:00:00Z" }, editable: true };
const allDay: CalendarEvent = { id: "all-day", title: "Annual leave", start: { date: "2026-10-14" }, end: { date: "2026-10-16" }, editable: false };
describe("calendar boundaries", () => {
  it("includes all-day dates without shifting them to the device timezone and honors the exclusive end", () => {
    for (const timezone of ["America/New_York", "Pacific/Kiritimati", "Pacific/Honolulu"]) {
      expect(calendarEventOccursOnDay(allDay, "2026-10-14", timezone)).toBe(true);
      expect(calendarEventOccursOnDay(allDay, "2026-10-15", timezone)).toBe(true);
      expect(calendarEventOccursOnDay(allDay, "2026-10-16", timezone)).toBe(false);
      expect(calendarEventOccursOnDay(allDay, "2026-10-13", timezone)).toBe(false);
    }
  });
  it("does not carry a meeting ending at local midnight into the next day", () => {
    expect(calendarEventOccursOnDay(timed, "2026-10-14", "America/New_York")).toBe(true);
    expect(calendarEventOccursOnDay(timed, "2026-10-15", "America/New_York")).toBe(false);
  });
  it("includes a zero-duration event on its start day and rejects malformed boundaries", () => {
    expect(calendarEventOccursOnDay({ ...timed, start: timed.end }, "2026-10-15", "America/New_York")).toBe(true);
    expect(calendarEventSchema.safeParse({ ...timed, end: { dateTime: "invalid" } }).success).toBe(false);
    expect(calendarEventSchema.safeParse({ ...allDay, end: allDay.start }).success).toBe(false);
  });
});

describe("authenticated calendar retrieval", () => {
  it("uses the account endpoint, no-store, and the caller's cancellation signal", async () => {
    const signal = new AbortController().signal;
    const fetcher = vi.fn().mockResolvedValue(Response.json({ events: [timed, allDay], fetchedAt: "2026-10-14T15:00:00Z", truncated: true }));
    const result = await fetchCalendarEvents("2026-10-14", signal, fetcher);
    expect(fetcher.mock.calls[0][0]).toMatch(/^\/api\/account\/calendar\/events\?/);
    expect(fetcher.mock.calls[0][1]).toEqual({ cache: "no-store", signal });
    expect(result).toMatchObject({ events: [timed, allDay], loading: false, truncated: true, error: "" });
  });
  it("does not retain events after an authorization failure", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ code: "calendar_reauth_required", error: "Reconnect your calendar" }, { status: 409 }));
    const result = await fetchCalendarEvents("2026-10-14", new AbortController().signal, fetcher);
    expect(result).toMatchObject({ requiresReconnect: true, error: "Reconnect your calendar", loading: false });
    expect(result.events).toBeUndefined();
  });
  it("rejects malformed success payloads before they can crash the agenda view", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ events: { title: "not an array" }, fetchedAt: "2026-10-14T15:00:00Z" }));
    await expect(fetchCalendarEvents("2026-10-14", new AbortController().signal, fetcher)).rejects.toThrow();
  });
});
