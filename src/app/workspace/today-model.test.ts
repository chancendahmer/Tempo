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
  it("shows today's task in the focus banner and collapsed checklist ahead of older deadlines", () => {
    const data = fixture();
    data.items = [];
    const [task] = data.tasks;
    data.tasks = [
      { ...task, id: "oldest", title: "File October notes", dueAt: "2026-10-01T16:00:00Z" },
      { ...task, id: "middle", title: "Send October invoice", dueAt: "2026-10-03T16:00:00Z" },
      { ...task, id: "latest", title: "Book October appointment", dueAt: "2026-10-04T16:00:00Z" },
      { ...task, id: "current", title: "Send the project update", dueAt: "2026-11-11T21:30:00Z" },
    ];
    const now = new Date("2026-11-11T20:00:00Z");
    const html = renderToday(data, now);
    expect(html.match(/<h2>([^<]+)<\/h2>/)?.[1]).toBe("Send the project update");
    expect(Array.from(html.matchAll(/aria-label="Complete ([^"]+)"/g), match => match[1]))
      .toEqual(["Send the project update", "Book October appointment", "Send October invoice"]);

    data.tasks.pop();
    expect(renderToday(data, now).match(/<h2>([^<]+)<\/h2>/)?.[1]).toBe("Book October appointment");
  });

  it("orders today's tasks by local due time, then overdue, undated, and future tasks across UTC midnight", () => {
    const data = fixture();
    const [task] = data.tasks;
    const future = { ...task, id: "future", dueAt: "2026-11-12T05:00:00Z" };
    data.tasks = [
      { ...task, id: "later-future", dueAt: "2026-11-13T15:00:00Z" },
      { ...task, id: "late-today", dueAt: "2026-11-12T04:59:00Z" },
      { ...task, id: "overdue", dueAt: "2026-11-11T04:59:00Z" },
      { ...task, id: "undated", dueAt: null },
      future,
      { ...task, id: "earlier-today", dueAt: "2026-11-11T22:00:00Z" },
    ];
    const now = new Date("2026-11-12T02:30:00Z");
    const model = todayModel(data, now);
    expect(model.day).toBe("2026-11-11");
    expect(model.nextTask?.id).toBe("earlier-today");
    expect(model.tasks.map(task => task.id)).toEqual(["earlier-today", "late-today", "overdue", "undated", "future", "later-future"]);

    data.tasks = [future];
    const futureOnly = todayModel(data, now);
    expect(futureOnly.nextTask).toBeUndefined();
    expect(futureOnly.tasks.map(task => task.id)).toEqual(["future"]);
  });

  it("labels an earlier local due day as overdue in NOW and the task checklist", () => {
    const data = fixture();
    data.items = [];
    data.tasks = [{ ...data.tasks[0], title: "Carry forward this task", dueAt: "2026-10-16T03:59:00Z", status: "not_started" }];
    const html = renderToday(data, new Date("2026-10-18T18:00:00Z"));
    expect(html).toContain("Carry forward this task</h2>");
    expect(html).toContain("Overdue · Oct 15 · By end of day");
    expect(html.match(/Overdue · Oct 15 · By end of day/g)).toHaveLength(1);
    expect(html).toContain(`Start ${data.tasks[0].estimatedMinutes} min`);
  });
  it("keeps a date-only deadline current through the account's local end of day", () => {
    const data = fixture();
    data.items = [];
    data.tasks = [{ ...data.tasks[0], dueAt: "2026-10-19T03:59:00Z", status: "not_started" }];
    const beforeMidnight = renderToday(data, new Date("2026-10-19T03:59:30Z"));
    expect(beforeMidnight).toContain("Oct 18 · By end of day");
    expect(beforeMidnight).not.toContain("Overdue");
    const afterMidnight = renderToday(data, new Date("2026-10-19T04:00:00Z"));
    expect(afterMidnight).toContain("Overdue · Oct 18 · By end of day");
  });
  it("keeps future started work and persisted focus distinct from overdue metadata", () => {
    const data = fixture();
    data.items = [];
    data.tasks = [{ ...data.tasks[0], title: "Future work already started", dueAt: "2026-10-20T14:00:00Z", status: "in_progress" }];
    const now = new Date("2026-10-18T18:00:00Z");
    const future = renderToday(data, now);
    expect(future).toContain("Future work already started</h2>");
    expect(future).not.toContain("Overdue");
    data.tasks[0].dueAt = "2026-10-16T03:59:00Z";
    data.items = [{ id: "paused-focus", version: 1, data: { kind: "focus", title: "My current focused step", taskId: data.tasks[0].id, remaining: 120, endsAt: null } }];
    const focus = renderToday(data, now);
    expect(focus).toContain("My current focused step</h2>");
    expect(focus).toContain("Paused. Continue when you&#x27;re ready.");
    expect(focus).toContain("Continue focus");
    expect(focus).toContain(">Paused</span>");
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
    expect(html).toContain("Refreshing your calendar");
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
    expect(html).toContain("Already working on tomorrow’s essay</h2>");
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
    expect(html).toContain("Working on my morning step</h2>");
    expect(html).toContain("Continue focus");
    expect(html).not.toContain("Start 25 minutes");
    // The compact Home links into the routine editor; only the saved active focus can resume.
    expect(html).toContain("Continue focus");
    expect(html).toMatch(/aria-label="Start [^"]+"[^>]*disabled=""/);

  });
  it("uses the persisted focus item ahead of another started task", () => {
    const data = fixture();
    data.tasks[0].title = "Upcoming essay";
    data.tasks[1].title = "Another started task";
    data.tasks[1].status = "in_progress";
    data.items.unshift({ id: "current-focus", version: 1, data: { kind: "focus", title: "The session actually running", taskId: data.tasks[0].id, remaining: 120, endsAt: null } });
    const now = new Date("2026-10-14T18:00:00Z");
    const model = todayModel(data, now);
    expect(model.nextTask?.id).toBe("tomorrow");
    expect(model.tasks.map(task => task.id)).toEqual(["tomorrow", "today", "undated"]);
    const html = renderToday(data, now);
    expect(html).toContain("The session actually running</h2>");
    expect(html).toContain(">Paused</span>");
    expect(html.match(/<button[^>]+aria-label="Continue Upcoming essay"[^>]*>/)?.[0]).not.toContain("disabled");
    expect(html.match(/<button[^>]+aria-label="Start [^"]+ Another started task"[^>]*>/)?.[0]).toContain('aria-describedby="home-focus-help" disabled');
    expect(html.match(/<button[^>]+aria-label="Customize icon and starting timer for Another started task"[^>]*>/)?.[0]).toContain("disabled");
    const savedFocus = data.items[0].data;
    if (savedFocus.kind !== "focus") throw new Error("Missing focus fixture");
    savedFocus.endsAt = new Date(now.getTime() + 60_000).toISOString();
    expect(renderToday(data, now)).toContain("Timer running. One step at a time.");
    savedFocus.endsAt = new Date(now.getTime() - 1_000).toISOString();
    expect(renderToday(data, now)).toContain(">Timer finished</span>");
    expect(data.tasks[0].status).not.toBe("completed");
    data.items.shift();
    data.tasks[0].status = "in_progress";
    expect(renderToday(data, now).match(/aria-label="Continue [^"]+"/g)).toHaveLength(1);
  });
});
