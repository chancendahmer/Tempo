import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarView } from "./CalendarView";
import { TasksView } from "./PlanningViews";
import { previewWorkspace } from "./workspace-data";

const calendar = vi.hoisted(() => ({ events: [], error: "", loading: false, requiresReconnect: false, disconnected: false }));
vi.mock("./use-calendar-events", () => ({ useCalendarEvents: () => calendar }));

const now = new Date("2026-10-19T15:00:00Z");
const fixture = () => previewWorkspace(now);
const renderCalendar = (data = fixture()) => renderToStaticMarkup(createElement(CalendarView, { data, preview: true, ask: vi.fn(), editTask: vi.fn() }));
const renderTasks = (data = fixture()) => renderToStaticMarkup(createElement(TasksView, { data, today: "2026-10-19", saving: false, edit: vi.fn(), start: vi.fn(), complete: vi.fn(), reopen: vi.fn(), remove: vi.fn() }));

afterEach(() => { vi.useRealTimers(); calendar.error = ""; });

describe("Planner context", () => {
  it("shows linked goal names and a route to completed work", () => {
    const data = fixture();
    const html = renderTasks(data);
    const goal = data.goals.find(goal => goal.id === data.tasks[0].goalId)!;
    expect(html).toContain(goal.title);
    expect(html).toContain(`${data.tasks.filter(task => task.status === "completed").length} completed`);
  });

  it("does not present a partial group estimate as the whole workload", () => {
    const data = fixture();
    data.tasks = [{ ...data.tasks[0], estimatedMinutes: 15 }, { ...data.tasks[0], id: "unknown", estimatedMinutes: null }];
    expect(renderTasks(data)).not.toContain("min estimated");
  });

  it("anchors the week on Monday and marks today independently from selection", () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const html = renderCalendar();
    expect(html).toContain('aria-label="Monday, October 19, 2026" aria-current="date" aria-pressed="true"');
    expect(html).toContain('aria-label="Sunday, October 25, 2026"');
    expect(html).not.toContain('aria-label="Friday, October 16, 2026"');
  });

  it("keeps removed tasks out of the agenda and preserves unknown durations", () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const data = fixture();
    data.tasks = [{ ...data.tasks[0], title: "Plan a small step", estimatedMinutes: null }, { ...data.tasks[0], id: "removed", title: "Removed task", status: "abandoned" }];
    const html = renderCalendar(data);
    expect(html).toContain("Plan a small step");
    expect(html).not.toContain("Removed task");
    expect(html).not.toContain("25 min");
    expect(html).toContain("1 to-do");
  });

  it("offers a retry while retaining saved tasks during a calendar error", () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    calendar.error = "Please try later.";
    const data = fixture();
    const html = renderCalendar(data);
    expect(html).toContain("Try again");
    expect(html).toContain("Events unavailable");
    expect(html).toContain(data.tasks[0].title);
    expect(html).not.toContain("A little room to breathe");
  });
});
