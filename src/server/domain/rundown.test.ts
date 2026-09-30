import { describe, expect, it, vi } from "vitest";
import { buildRundown, parseRundownRequest, rundownRange } from "./rundown";
import type { TaskRecord } from "./task-service";

const context = { userId: "owner", timezone: "America/New_York", now: new Date("2027-03-14T16:00:00Z") };
const request = { startDate: "2027-03-14", days: 1 as const };

describe("account rundown", () => {
  it("ends remaining-week requests on the local Sunday, including tomorrow variants", () => {
    const wednesday = new Date("2026-09-30T16:00:00Z");
    expect(parseRundownRequest("Show me my rundown for rest of this week", wednesday, context.timezone)).toEqual({ startDate: "2026-09-30", days: 5 });
    expect(parseRundownRequest("What do I have tomorrow and for the rest of this week? Include tasks, goals and calendar plans.", wednesday, context.timezone)).toEqual({ startDate: "2026-10-01", days: 4 });
    const sundayInNewYork = new Date("2026-10-05T02:00:00Z");
    expect(parseRundownRequest("What do I have rest of this week?", sundayInNewYork, context.timezone)).toEqual({ startDate: "2026-10-04", days: 1 });
    expect(parseRundownRequest("What do I have tomorrow and the rest of this week?", sundayInNewYork, context.timezone)).toBeNull();
    expect(parseRundownRequest("What do I have rest of this week?", sundayInNewYork, "UTC")).toEqual({ startDate: "2026-10-05", days: 7 });
    expect(parseRundownRequest("Show me my rundown for rest of this week and delete my tasks", wednesday, context.timezone)).toBeNull();
    expect(() => rundownRange({ startDate: "2026-10-01", days: 8 }, context.timezone)).toThrow();
  });
  it("uses local midnights across daylight saving changes", () => {
    expect(rundownRange(request, context.timezone)).toEqual({ start: new Date("2027-03-14T05:00:00Z"), end: new Date("2027-03-15T04:00:00Z") });
    const autumn = rundownRange({ startDate: "2027-11-07", days: 1 }, context.timezone);
    expect(+autumn.end - +autumn.start).toBe(25 * 3600000);
    expect(() => rundownRange({ startDate: "2027-02-30", days: 1 }, context.timezone)).toThrow();
  });

  it("resolves local dates and Monday-based weeks without consuming edit requests", () => {
    expect(parseRundownRequest("Show me my rundown for tomorrow", context.now, context.timezone)).toEqual({ startDate: "2027-03-15", days: 1 });
    expect(parseRundownRequest("What's my week look like?", context.now, context.timezone)).toEqual({ startDate: "2027-03-08", days: 7 });
    expect(parseRundownRequest("Weekly rundown for next week", context.now, context.timezone)).toEqual({ startDate: "2027-03-15", days: 7 });
    expect(parseRundownRequest("rundown for 2027-04-01", context.now, context.timezone)).toEqual({ startDate: "2027-04-01", days: 1 });
    expect(parseRundownRequest("Give me my rundown and delete my tasks", context.now, context.timezone)).toBeNull();
  });

  it("combines date-filtered records, projects recurring reminders, and scopes every lookup to the owner", async () => {
    const task = (title: string, dueAt: string | null): TaskRecord => ({ id: title, title, status: "not_started", goalId: null, estimatedMinutes: null, dueAt: dueAt ? new Date(dueAt) : null });
    const tasks = { list: vi.fn(async () => [task("Today task", "2027-03-14T18:00:00Z"), task("Tomorrow task", "2027-03-15T04:00:00Z"), task("Undated task", null), task("Old task", "2027-03-13T18:00:00Z")]) };
    const goals = { list: vi.fn(async () => [{ id: "g", title: "Run a race", status: "active" as const, description: null }]) };
    const reminders = { listForRundown: vi.fn(async () => [{ id: "r", text: "Drink water", remindAt: new Date("2027-03-13T14:00:00Z"), timezone: context.timezone, recurrence: "daily" as const, occurrenceCount: 0, status: "scheduled" as const }]) };
    const integrations = { agenda: vi.fn(async () => JSON.stringify({ events: [{ title: "Family day", start: { date: "2027-03-14" } }], truncated: true })) };
    const reply = await buildRundown({ tasks, goals, reminders, integrations }, context, request);
    for (const text of ["Today task", "Undated task", "Overdue", "Old task", "Run a race", "not scheduled", "Drink water", "9:00 AM", "all day", "Family day", "more events"]) expect(reply).toContain(text);
    expect(reply).not.toContain("Tomorrow task");
    expect(tasks.list).toHaveBeenCalledWith("owner", "open");
    expect(goals.list).toHaveBeenCalledWith("owner", "active");
    expect(reminders.listForRundown).toHaveBeenCalledWith("owner", new Date("2027-03-14T05:00:00Z"), new Date("2027-03-15T04:00:00Z"));
    expect(integrations.agenda).toHaveBeenCalledWith("owner", "2027-03-14T05:00:00.000Z", "2027-03-15T04:00:00.000Z");
  });

  it("keeps available sections when calendar fails and reports incomplete data", async () => {
    const reply = await buildRundown({ tasks: { list: async () => [] }, goals: { list: async () => [] }, integrations: { agenda: async () => { throw new Error("private provider details"); } } }, context, request);
    expect(reply).toContain("Calendar unavailable or not connected");
    expect(reply).toContain("Reminders unavailable");
    expect(reply).toContain("Tasks due\nNone.");
    expect(reply).not.toContain("private provider details");
  });
});
