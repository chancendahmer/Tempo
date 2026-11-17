import { describe, expect, it } from "vitest";
import { findNewTaskId } from "./task-save-confirmation";
import type { Workspace } from "./workspace-data";

const command = { type: "create_task", title: "  Outline three points  " } as const;
const task: Workspace["tasks"][number] = {
  id: "created",
  title: "Outline three points",
  status: "not_started",
  dueAt: null,
  estimatedMinutes: null,
  goalId: null,
  startedAt: null,
};

describe("findNewTaskId", () => {
  it("identifies a new undated task and excludes a preexisting duplicate", () => {
    const updated = { tasks: [task, { ...task, id: "existing" }] };
    expect(findNewTaskId(new Set(["existing"]), updated, command)).toBe(task.id);
    expect(findNewTaskId(new Set([task.id, "existing"]), updated, command)).toBeUndefined();
  });

  it("requires the exact saved due time, estimate and goal", () => {
    const dated = { ...task, dueAt: "2026-11-18T17:00:00.000Z", estimatedMinutes: 10, goalId: "goal" };
    const updated = { tasks: [dated] };
    const details = { dueAt: "2026-11-18T12:00:00-05:00", estimatedMinutes: 10, goalId: "goal" };
    expect(findNewTaskId(new Set(), updated, { ...command, ...details })).toBe(task.id);
    expect(findNewTaskId(new Set(), updated, { ...command, estimatedMinutes: 10, goalId: "goal" })).toBeUndefined();
    expect(findNewTaskId(new Set(), updated, { ...command, ...details, estimatedMinutes: 20 })).toBeUndefined();
    expect(findNewTaskId(new Set(), updated, { ...command, ...details, goalId: "other" })).toBeUndefined();
  });

  it("omits the direct action when the data is missing, truncated or ambiguous", () => {
    const previousIds = new Set<string>();
    expect(findNewTaskId(null, { tasks: [task] }, command)).toBeUndefined();
    expect(findNewTaskId(previousIds, undefined, command)).toBeUndefined();
    expect(findNewTaskId(previousIds, { tasks: [task], tasksTruncated: true }, command)).toBeUndefined();
    expect(findNewTaskId(previousIds, { tasks: [task, { ...task, id: "concurrent" }] }, command)).toBeUndefined();
  });
});
