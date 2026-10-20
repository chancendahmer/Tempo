import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CalendarView } from "./CalendarView";
import { TodayView } from "./TodayView";
import { previewWorkspace, type Workspace } from "./workspace-data";

function fixture(calendar: Workspace["calendar"]) {
  const now = new Date();
  const data = previewWorkspace(now);
  data.calendar = calendar; data.demoCalendarEvents = undefined; data.timezone = "UTC";
  data.tasks = [{ ...data.tasks[0], title: "My task stays available", dueAt: now.toISOString() }];
  data.items = []; data.reminders = [];
  data.busy = [{ id: "old-disconnected-event", startsAt: new Date(now.getTime() - 60000).toISOString(), endsAt: new Date(now.getTime() + 60000).toISOString() }];
  return { data, now };
}
function today(data: Workspace, now: Date) { return renderToStaticMarkup(createElement(TodayView, { motion: false, setMotion: vi.fn(), data, now, saving: false, go: vi.fn(), onSetup: () => {}, editTask: vi.fn(), startTask: vi.fn(), completeTask: vi.fn(), checkStep: vi.fn(), startStep: vi.fn(), editRoutine: vi.fn(), ask: vi.fn() })); }
function calendar(data: Workspace) { return renderToStaticMarkup(createElement(CalendarView, { data, preview: false, ask: vi.fn(), editTask: vi.fn() })); }

describe("optional calendar connection", () => {
  it.each([null, { status: "disconnected", lastSyncedAt: null }])("keeps an unconnected account useful without presenting an outage (%j)", connection => {
    const { data, now } = fixture(connection);
    for (const html of [today(data, now), calendar(data)]) {
      expect(html).toContain("Connect Google Calendar");
      expect(html).toContain("My task stays available");
      expect(html).not.toContain("Refreshing your calendar");
      expect(html).not.toContain("couldn’t refresh");
      expect(html).not.toContain("Calendar time");
      expect(html).not.toContain('aria-label="Refresh Google Calendar"');
    }
  });
  it("still loads active calendars and keeps reauthorization distinct from initial setup", () => {
    const active = fixture({ status: "active", lastSyncedAt: null });
    expect(today(active.data, active.now)).toContain("Refreshing your calendar");
    expect(calendar(active.data)).toContain('aria-label="Refresh Google Calendar"');
    const expired = fixture({ status: "requires_reauth", lastSyncedAt: null });
    expect(calendar(expired.data)).toContain("Reconnect Google Calendar");
    expect(today(expired.data, expired.now)).not.toContain("to include events.");
  });
});
