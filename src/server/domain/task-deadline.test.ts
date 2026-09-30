import { describe, expect, it } from "vitest";
import { normalizeTaskDeadline } from "./task-deadline";
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
  });
});
