import { describe, expect, it } from "vitest";
import { homeModel } from "./home-model";
import { previewWorkspace } from "./workspace-data";
import { readHomePreferences } from "../../server/domain/home-preferences";
import type { CalendarEvent } from "./calendar-event-model";
import { fallbackTaskPresentation, taskPresentation } from "../../server/domain/task-presentation";

function fixture() {
  const data = previewWorkspace(new Date("2026-10-21T12:10:00Z"));
  data.timezone = "America/New_York";
  data.tasks = [{ ...data.tasks[0], dueAt: null }];
  data.items = data.items.filter(item => item.data.kind === "routine");
  data.items.forEach(item => { if (item.data.kind === "routine") item.data.steps.forEach(step => { step.completedOn = null; }); });
  return data;
}
const workout: CalendarEvent = { id: "gym", title: "Upper body workout", start: { dateTime: "2026-10-21T21:00:00Z" }, end: { dateTime: "2026-10-21T22:00:00Z" }, editable: true };
describe("Home uses local time and saved plans", () => {
  it("rotates morning, work, planned dinner, and wind-down without replacing the task list", () => {
    const data = fixture();
    data.items.push({ id: "meal", version: 1, data: { kind: "meal", title: "Vegetable curry", date: "2026-10-21", meal: "Dinner", ingredients: "Carrots", servings: 2 } });
    const states = ["2026-10-21T12:10:00Z", "2026-10-21T17:00:00Z", "2026-10-21T22:00:00Z", "2026-10-22T01:30:00Z"].map(at => homeModel(data, new Date(at)));
    expect(states.map(state => state.mode)).toEqual(["morning", "focus", "meal", "evening"]);
    expect(states.every(state => state.tasks[0].id === data.tasks[0].id)).toBe(true);
    expect(states[2].hero.title).toBe("Vegetable curry");
    expect(states[2].hero.image).toBe("/images/home/meal.png");
    expect(states[3].day).toBe("2026-10-21");
  });
  it("only promotes workouts near scheduled activity, never an already logged workout", () => {
    const data = fixture();
    data.items.push({ id: "logged", version: 1, data: { kind: "workout", title: "Morning run", activity: "Cardio", minutes: 30, date: "2026-10-21" } });
    expect(homeModel(data, new Date("2026-10-21T20:00:00Z"), [workout]).mode).toBe("focus");
    expect(homeModel(data, new Date("2026-10-21T20:30:00Z"), [workout]).hero).toMatchObject({ mode: "workout", title: workout.title, destination: "calendar", action: "View activity" });
    expect(homeModel(data, new Date("2026-10-21T22:01:00Z"), [workout]).mode).toBe("focus");
  });
  it("starts the exact scheduled movement task promoted in the banner", () => {
    const data = fixture();
    const walk = { ...data.tasks[0], id: "walk", title: "Walk home from design lab", estimatedMinutes: 20, dueAt: "2026-10-21T19:10:00Z" };
    data.tasks.push(walk);
    expect(homeModel(data, new Date("2026-10-21T19:05:00Z")).hero).toMatchObject({ mode: "workout", destination: "tasks", action: "Start 20 min", task: { id: "walk" } });
  });
  it("keeps a running focus first; explicit pin and temporary selection remain user controlled", () => {
    const data = fixture(), now = new Date("2026-10-21T20:30:00Z");
    data.items.push({ id: "focus", version: 1, data: { kind: "focus", title: "Writing", remaining: 300, endsAt: null } });
    expect(homeModel(data, now, [workout]).hero).toMatchObject({ title: "Writing", mode: "focus", ongoingFocus: true });
    data.homePreferences = { ...readHomePreferences({}), pinned: "morning" };
    expect(homeModel(data, now, [workout]).mode).toBe("morning");
    expect(homeModel(data, now, [workout], "workout").mode).toBe("workout");
  });
  it("keeps all-day boundaries exclusive and excludes tomorrow, even across UTC midnight", () => {
    const data = fixture();
    const events: CalendarEvent[] = [
      { id: "today", title: "Late call", start: { dateTime: "2026-10-22T02:30:00Z" }, end: { dateTime: "2026-10-22T03:00:00Z" }, editable: true },
      { id: "tomorrow", title: "Tomorrow call", start: { dateTime: "2026-10-22T13:00:00Z" }, end: { dateTime: "2026-10-22T14:00:00Z" }, editable: true },
      { id: "all-day", title: "Offsite", start: { date: "2026-10-21" }, end: { date: "2026-10-22" }, editable: false },
    ];
    expect(homeModel(data, new Date("2026-10-22T02:00:00Z"), events).calendar.map(row => row.id)).toEqual(["all-day", "today"]);
    expect(homeModel(data, new Date("2026-10-22T04:00:00Z"), events).calendar.map(row => row.id)).toEqual(["tomorrow"]);
  });
  it("honors a custom morning window on a daylight-saving boundary", () => {
    const data = fixture();
    data.homePreferences = { ...readHomePreferences({}), morningTime: "06:30" };
    expect(homeModel(data, new Date("2026-11-01T11:45:00Z")).mode).toBe("morning");
    expect(homeModel(data, new Date("2026-11-01T14:00:00Z")).mode).toBe("focus");
  });
  it("keeps defaults honest, context-aware, and manual overrides stable", () => {
    expect(fallbackTaskPresentation("Write a report about grocery shopping").category).toBe("work");
    expect(fallbackTaskPresentation("Pick up oats").category).toBe("shopping");
    expect(fallbackTaskPresentation("Send project update").focusMinutes).toBe(5);
    expect(taskPresentation({ title: "New title", presentation: { title: "Old title", source: "ai", category: "food", focusMinutes: 20 } }).source).toBe("fallback");
    expect(taskPresentation({ title: "New title", presentation: { title: "Old title", source: "manual", category: "food", focusMinutes: 7 } }).focusMinutes).toBe(7);
  });
});
