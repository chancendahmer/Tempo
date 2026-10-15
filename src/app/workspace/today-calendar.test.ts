import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { todayModel } from "./today-model";
import { previewWorkspace } from "./workspace-data";
import { TodayView } from "./TodayView";
import type { CalendarEvent } from "./calendar-event-model";

const mocked = vi.hoisted(() => ({ events: [] as CalendarEvent[], loading: false, error: "" }));
vi.mock("./use-calendar-events", () => ({ useCalendarEvents: () => ({ events: mocked.events, loading: mocked.loading, error: mocked.error, requiresReconnect: false, fetched: "2026-10-14T15:00:00Z", truncated: false }) }));

const meeting: CalendarEvent = { id: "real-meeting", title: "Authenticated project review", start: { dateTime: "2026-10-14T14:00:00Z" }, end: { dateTime: "2026-10-14T16:00:00Z" }, editable: true };
const allDay: CalendarEvent = { id: "real-all-day", title: "Team offsite day", start: { date: "2026-10-14" }, end: { date: "2026-10-15" }, editable: false };
function fixture() {
  const data = previewWorkspace(new Date("2026-10-14T15:00:00Z"));
  data.timezone = "America/New_York";
  data.demoCalendarEvents = undefined;
  data.items = [];
  data.reminders = [];
  data.tasks = [{ ...data.tasks[0], title: "Task still due this afternoon", dueAt: "2026-10-14T17:00:00Z", status: "not_started" }];
  data.busy = [{ id: "opaque-window", startsAt: meeting.start.dateTime!, endsAt: meeting.end.dateTime! }];
  return data;
}
function render(data = fixture(), now = new Date("2026-10-14T15:00:00Z")) {
  return renderToStaticMarkup(createElement(TodayView, { data, now, saving: false, go: vi.fn(), editTask: vi.fn(), startTask: vi.fn(), completeTask: vi.fn(), checkStep: vi.fn(), startStep: vi.fn(), editRoutine: vi.fn(), ask: vi.fn(), onResumeFocus: vi.fn() }));
}
describe("Today uses authenticated calendar details", () => {
  it("replaces opaque busy windows with actual event titles and respects a successful empty response", () => {
    const data = fixture();
    expect(todayModel(data, new Date("2026-10-14T15:00:00Z"), [meeting]).events.find(event => event.kind === "calendar")?.title).toBe(meeting.title);
    expect(todayModel(data, new Date("2026-10-14T15:00:00Z"), []).events.some(event => event.kind === "calendar")).toBe(false);
  });
  it("shows the ongoing meeting in NOW without hiding the next task from the timeline", () => {
    mocked.events = [meeting];
    const html = render();
    expect(html).toContain(`${meeting.title}</h3>`);
    expect(html).toContain("Happening now");
    expect(html).toContain("<strong>Task still due this afternoon</strong>");
    expect(html).not.toContain("Calendar time");
  });
  it("keeps persisted focus ahead of a meeting and still lists the meeting", () => {
    mocked.events = [meeting];
    const data = fixture();
    data.items = [{ id: "focus", version: 1, data: { kind: "focus", title: "Writing with focus", remaining: 600, endsAt: null } }];
    const html = render(data);
    expect(html).toContain("Writing with focus</h3>");
    expect(html).toContain(`<strong>${meeting.title}</strong>`);
  });
  it("shows all-day events without pretending they are an active timed appointment", () => {
    mocked.events = [allDay, meeting];
    const html = render();
    expect(html).toContain("<time>All day</time>");
    expect(html).toContain(`<strong>${allDay.title}</strong>`);
    expect(html).toContain(`${meeting.title}</h3>`);
    expect(html).not.toContain("Nothing else scheduled today");
    expect(todayModel(fixture(), new Date("2026-10-15T15:00:00Z"), [allDay]).events.some(event => event.id === allDay.id)).toBe(false);
  });
  it("ends Happening now at the exact event end", () => {
    mocked.events = [meeting];
    const html = render(fixture(), new Date("2026-10-14T16:00:00Z"));
    expect(html).not.toContain("Happening now");
    expect(html).toContain("Earlier today");
  });
  it("does not claim the day is clear when Google details are still loading or unavailable", () => {
    mocked.events = []; mocked.loading = true;
    expect(render()).toContain("Refreshing your calendar");
    expect(render()).not.toContain("Nothing else scheduled today");
    mocked.loading = false; mocked.error = "Reconnect";
    expect(render()).toContain("Calendar details couldn’t refresh");
    expect(render()).not.toContain("Nothing else scheduled today");
    mocked.error = "";
  });
});
