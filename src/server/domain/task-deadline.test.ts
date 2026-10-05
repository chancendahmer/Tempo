import { describe, expect, it } from "vitest";
import { assessTaskDeadline, normalizeTaskDeadline } from "./task-deadline";
import type { TaskCommand } from "./task-commands";

describe("explicit task wall-clock deadlines", () => {
  const now = new Date("2026-09-30T20:15:00Z");
  it("corrects a model's double-offset update without changing other patch fields", () => {
    const command: TaskCommand = { type: "update_task", taskQuery: "laundry", patch: { title: "Fold demo laundry", estimatedMinutes: 10, dueAt: "2026-10-01T00:45:00Z" } };
    expect(normalizeTaskDeadline(command, "Please fix that laundry task: call it Fold demo laundry, make it 10 minutes, and set its deadline to today at 4:45pm.", now, "America/New_York")).toEqual({ ...command, patch: { ...command.patch, dueAt: "2026-09-30T20:45:00.000Z" } });
  });
  it("canonicalizes creation using the account date rather than UTC date", () => {
    expect(normalizeTaskDeadline({ type: "create_task", title: "Laundry", dueAt: "2026-10-01T16:45:00Z" }, "Laundry today by 4:45pm", new Date("2026-10-01T01:00:00Z"), "America/New_York")).toMatchObject({ dueAt: "2026-09-30T20:45:00.000Z" });
  });
  it.each(["Saturday morning", "today at 4", "today at 4:45pm UTC", "today at 4pm or tomorrow at 5pm"])("does not guess an unsupported or ambiguous request: %s", message => {
    const command: TaskCommand = { type: "create_task", title: "Laundry" };
    expect(normalizeTaskDeadline(command, message, now, "America/New_York")).toEqual(command);
  });
  it.each(["2027-03-14T05:00:00Z", "2027-11-07T04:00:00Z"])("does not normalize ambiguous or nonexistent DST wall clocks (%s)", instant => {
    const command: TaskCommand = { type: "create_task", title: "Laundry" };
    const time = instant.includes("03-14") ? "2:30am" : "1:30am";
    expect(normalizeTaskDeadline(command, `today at ${time}`, new Date(instant), "America/New_York")).toEqual(command);
    expect(assessTaskDeadline(command, `today at ${time}`, new Date(instant), "America/New_York").clarification).toMatch(/clocks change/);
  });
  it("canonicalizes a named Sunday rather than accepting Monday with the right hour", () => {
    const command: TaskCommand = { type: "create_task", title: "Stretch", estimatedMinutes: 5, dueAt: "2026-10-05T09:00:00-04:00" };
    expect(assessTaskDeadline(command, "Add a five-minute stretch for Sunday morning at 9 AM", now, "America/New_York")).toEqual({ command: { ...command, dueAt: "2026-10-04T13:00:00.000Z" } });
  });
  it("keeps a spaced PM clock and does not invent deadline changes in a title edit", () => {
    expect(assessTaskDeadline({ type: "create_task", title: "Laundry" }, "Add Laundry Saturday at 4:45 PM", now, "America/New_York").command).toMatchObject({ dueAt: "2026-10-03T20:45:00.000Z" });
    const command: TaskCommand = { type: "update_task", taskQuery: "tomorrow", patch: { title: "Tomorrow at 9 AM" } };
    expect(assessTaskDeadline(command, "Rename that task to Tomorrow at 9 AM", now, "America/New_York")).toEqual({ command });
  });
  it("honors a specific later Sunday and rejects contradictory weekday/date labels", () => {
    const command: TaskCommand = { type: "create_task", title: "Stretch", dueAt: "2026-10-04T09:00:00-04:00" };
    expect(assessTaskDeadline(command, "Stretch on Sunday October 11 at 9 AM", now, "America/New_York").command).toMatchObject({ dueAt: "2026-10-11T13:00:00.000Z" });
    expect(assessTaskDeadline(command, "Stretch on Sunday 2026-10-11 at 9 AM", now, "America/New_York").command).toMatchObject({ dueAt: "2026-10-11T13:00:00.000Z" });
    expect(assessTaskDeadline(command, "Stretch on Monday October 11 at 9 AM", now, "America/New_York").clarification).toContain("do not match");
    expect(assessTaskDeadline(command, "Stretch on Sunday 10/11 at 9 AM", now, "America/New_York").clarification).toContain("spell out");
  });
  it("preserves patch fields when resolving Saturday and rejects a contradictory date-only deadline", () => {
    const command: TaskCommand = { type: "update_task", taskQuery: "walk", patch: { estimatedMinutes: 10, dueAt: "2026-10-05T13:00:00Z" } };
    expect(assessTaskDeadline(command, "Move walk to Saturday at 9 AM", now, "America/New_York")).toEqual({ command: { ...command, patch: { ...command.patch, dueAt: "2026-10-03T13:00:00.000Z" } } });
    expect(assessTaskDeadline(command, "Move walk to Saturday", now, "America/New_York").clarification).toContain("date and time");
  });
  it("asks about an ambiguous half-hour DST fold instead of guessing", () => {
    expect(assessTaskDeadline({ type: "create_task", title: "Stretch" }, "2027-04-04 at 1:45am", now, "Australia/Lord_Howe").clarification).toContain("occurs twice");
  });
  it("honors an explicit UTC offset when selecting an ambiguous occurrence", () => {
    expect(assessTaskDeadline({ type: "create_task", title: "Stretch", dueAt: "2027-11-07T05:30:00Z" }, "Stretch on November 7, 2027 at 1:30 AM UTC-05:00", now, "America/New_York").command).toMatchObject({ dueAt: "2027-11-07T06:30:00.000Z" });
  });
});
