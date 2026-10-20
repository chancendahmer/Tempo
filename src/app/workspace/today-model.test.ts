import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { todayModel } from "./today-model";
import { previewWorkspace } from "./workspace-data";
import { TodayView } from "./TodayView";

function renderToday(data: ReturnType<typeof previewWorkspace>, now: Date) {
  return renderToStaticMarkup(createElement(TodayView, { motion: false, setMotion: vi.fn(), data, now, saving: false, go: vi.fn(), onSetup: () => {}, editTask: vi.fn(), startTask: vi.fn(), completeTask: vi.fn(), checkStep: vi.fn(), startStep: vi.fn(), editRoutine: vi.fn(), ask: vi.fn(), onResumeFocus: vi.fn() }));
}

function fixture() {
  const data = previewWorkspace();
  data.timezone = "America/New_York";
  data.calendar = { status: "active", lastSyncedAt: null };
  data.tasks = [
    { ...data.tasks[0], id: "tomorrow", dueAt: "2026-10-15T14:00:00Z" },
    { ...data.tasks[0], id: "today", dueAt: "2026-10-14T15:00:00Z" },
    { ...data.tasks[0], id: "undated", dueAt: null },
  ];
  data.reminders = [];
  data.busy = [];
  data.items = data.items.map(item => item.data.kind === "routine" ? { ...item, data: { ...item.data, steps: item.data.steps.map(step => ({ ...step, completedOn: null })) } } : item);
  return data;
}
describe("Today in the account timezone", () => {
  it("labels an earlier local due day as overdue in NOW and the task checklist", () => {
    const data = fixture();
    data.items = [];
    data.tasks = [{ ...data.tasks[0], title: "Carry forward this task", dueAt: "2026-10-16T03:59:00Z", status: "not_started" }];
    const html = renderToday(data, new Date("2026-10-18T18:00:00Z"));
    expect(html).toContain("Carry forward this task</h3>");
    expect(html).toContain("<p>Overdue · Oct 15 · By end of day</p>");
    expect(html.match(/Overdue · Oct 15 · By end of day/g)).toHaveLength(2);
    expect(html).toContain(`Start ${data.tasks[0].estimatedMinutes} minutes`);
  });
  it("keeps a date-only deadline current through the account's local end of day", () => {
    const data = fixture();
    data.items = [];
    data.tasks = [{ ...data.tasks[0], dueAt: "2026-10-19T03:59:00Z", status: "not_started" }];
    const beforeMidnight = renderToday(data, new Date("2026-10-19T03:59:30Z"));
    expect(beforeMidnight).toContain("Oct 18 · By end of day");
    expect(beforeMidnight).not.toContain("Overdue");
    const afterMidnight = renderToday(data, new Date("2026-10-19T04:00:00Z"));
    expect(afterMidnight).toContain("<p>Overdue · Oct 18 · By end of day</p>");
  });
  it("keeps future started work and persisted focus distinct from overdue metadata", () => {
    const data = fixture();
    data.items = [];
    data.tasks = [{ ...data.tasks[0], title: "Future work already started", dueAt: "2026-10-20T14:00:00Z", status: "in_progress" }];
    const now = new Date("2026-10-18T18:00:00Z");
    const future = renderToday(data, now);
    expect(future).toContain("Future work already started</h3>");
    expect(future).not.toContain("Overdue");
    data.tasks[0].dueAt = "2026-10-16T03:59:00Z";
    data.items = [{ id: "paused-focus", version: 1, data: { kind: "focus", title: "My current focused step", taskId: data.tasks[0].id, remaining: 120, endsAt: null } }];
    const focus = renderToday(data, now);
    expect(focus).toContain("My current focused step</h3>");
    expect(focus).toContain("<p>Focus paused. Continue when you’re ready.</p>");
    expect(focus).toContain("Continue focus");
    expect(focus.match(/Overdue · Oct 15 · By end of day/g)).toHaveLength(1);
  });
  it("uses the morning window, then returns to tasks without promoting tomorrow's task", () => {
    const data = fixture();
    expect(todayModel(data, new Date("2026-10-14T12:10:00Z")).activeRoutine?.data.period).toBe("morning");
    const afternoon = todayModel(data, new Date("2026-10-14T18:00:00Z"));
    expect(afternoon.activeRoutine).toBeUndefined();
    expect(afternoon.nextTask?.id).toBe("today");
    expect(afternoon.events.map(e => e.id)).toEqual(["today"]);
  });
  it("uses the account local day at UTC midnight and the saved evening time", () => {
    const data = fixture();
    const evening = todayModel(data, new Date("2026-10-15T01:30:00Z"));
    expect(evening.day).toBe("2026-10-14");
    expect(evening.activeRoutine?.data.period).toBe("evening");
  });
  it("does not restart completed routines, and excludes completed or abandoned tasks", () => {
    const data = fixture();
    data.items = data.items.map(item => item.data.kind === "routine" ? { ...item, data: { ...item.data, steps: item.data.steps.map(step => ({ ...step, completedOn: "2026-10-14" })) } } : item);
    data.tasks[1].status = "completed";
    data.tasks[2].status = "abandoned";
    const model = todayModel(data, new Date("2026-10-14T12:10:00Z"));
    expect(model.activeRoutine).toBeUndefined();
    expect(model.nextTask).toBeUndefined();
  });
  it("prioritizes an already-started task over an earlier deadline", () => {
    const data = fixture();
    data.tasks[2].status = "in_progress";
    expect(todayModel(data, new Date("2026-10-14T18:00:00Z")).nextTask?.id).toBe("undated");
  });
  it("orders actual reminders, tasks, and calendar windows and omits past sent reminders", () => {
    const data = fixture();
    data.reminders = [{ id: "sent", text: "Old reminder", remindAt: "2026-10-14T13:00:00Z", status: "sent" }, { id: "upcoming", text: "Call library", remindAt: "2026-10-14T16:00:00Z", status: "scheduled" }];
    data.busy = [{ id: "busy", startsAt: "2026-10-14T14:00:00Z", endsAt: "2026-10-14T14:30:00Z" }];
    expect(todayModel(data, new Date("2026-10-14T12:00:00Z")).events.map(e => e.id)).toEqual(["busy", "today", "upcoming"]);
  });
  it("keeps a current Calendar window visible until its end instead of saying the day is clear", () => {
    const data = fixture();
    data.tasks = []; data.items = [];
    data.busy = [{ id: "current-meeting", startsAt: "2026-10-14T14:00:00Z", endsAt: "2026-10-14T15:00:00Z" }];
    const now = new Date("2026-10-14T14:20:00Z");
    const model = todayModel(data, now);
    expect(model.events[0]).toMatchObject({ endsAt: "2026-10-14T15:00:00Z", ongoing: true });
    const html = renderToday(data, now);
    expect(html).toContain("Happening now");
    expect(html).not.toContain("Nothing else scheduled today");
    expect(html).not.toContain("Earlier today");
    expect(todayModel(data, new Date("2026-10-14T15:00:00Z")).events[0].ongoing).toBe(false);
  });
  it("continues an already-started task even when its due date is tomorrow", () => {
    const data = fixture();
    data.tasks[0].status = "in_progress";
    data.tasks[0].title = "Already working on tomorrow’s essay";
    const now = new Date("2026-10-14T18:00:00Z");
    expect(todayModel(data, now).nextTask?.id).toBe("tomorrow");
    const html = renderToday(data, now);
    expect(html).toContain("Already working on tomorrow’s essay</h3>");
    expect(html).toContain("Continue");
  });
  it("keeps the actual routine focus session prominent outside the routine window", () => {
    const data = fixture();
    const routine = data.items.find(item => item.data.kind === "routine" && item.data.period === "morning")!;
    if (routine.data.kind !== "routine") throw new Error("Missing routine fixture");
    const step = routine.data.steps[0];
    data.items.unshift({ id: "current-focus", version: 1, data: { kind: "focus", title: "Working on my morning step", routineId: routine.id, stepId: step.id, remaining: 120, endsAt: null } });
    const now = new Date("2026-10-14T18:00:00Z");
    const model = todayModel(data, now);
    expect(model.focus?.title).toBe("Working on my morning step");
    expect(model.activeRoutine?.id).toBe(routine.id);
    const html = renderToday(data, now);
    expect(html).toContain("Working on my morning step</h3>");
    expect(html).toContain("Continue focus");
    expect(html).not.toContain("Start 25 minutes");
    const resume = html.match(new RegExp(`aria-label="Continue ${step.title}"[^>]*>`))?.[0];
    expect(resume).toBeDefined();
    expect(resume).not.toContain("disabled");
    const differentStep = html.match(new RegExp(`aria-label="Start ${routine.data.steps[1].title}"[^>]*>`))?.[0];
    expect(differentStep).toContain("disabled");
  });
  it("uses the persisted focus item ahead of another started task", () => {
    const data = fixture();
    data.tasks[1].status = "in_progress";
    data.items.unshift({ id: "current-focus", version: 1, data: { kind: "focus", title: "The session actually running", taskId: data.tasks[0].id, remaining: 120, endsAt: null } });
    const now = new Date("2026-10-14T18:00:00Z");
    expect(todayModel(data, now).nextTask?.id).toBe("tomorrow");
    expect(renderToday(data, now)).toContain("The session actually running</h3>");
  });
});
