import { describe, expect, it } from "vitest";
import {
  parseTaskCommandHeuristically,
  resolveTaskReference,
  taskCommandSchema,
} from "./task-commands";

describe("task command validation and fallback parsing", () => {
  it("parses the core natural-language creation fixture", () => {
    expect(
      parseTaskCommandHeuristically(
        "I need to finish the Q3 report, probably a 2 hour job",
        new Date("2026-08-18T12:00:00.000Z"),
      ),
    ).toEqual({
      type: "create_task",
      title: "finish the Q3 report",
      estimatedMinutes: 120,
    });
  });

  it.each([
    "I need to fold the demo laundry today by 4:45pm. Add it as a ten-minute task.",
    "I need to finish the Q3 report by Friday, probably a 2 hour job",
    "Add a task to walk Saturday morning",
    "I need to do a ten-minute walk",
    "I need to call Mom at 4pm",
    "I need to call Mom on 10/3",
    "I need to file taxes. Make it urgent.",
  ])("defers unsupported or compound task details intact: %s", text => {
    expect(parseTaskCommandHeuristically(text)).toBeNull();
  });

  it.each([
    ["list my tasks", { type: "list_tasks", status: "open" }],
    ["done with the Q3 report", { type: "complete_task", taskQuery: "Q3 report" }],
    ["start the budget review", { type: "start_task", taskQuery: "budget review" }],
    ["abandon old proposal", { type: "abandon_task", taskQuery: "old proposal" }],
  ])("parses %s", (text, command) => {
    expect(parseTaskCommandHeuristically(text)).toEqual(command);
  });

  it("rejects a mutation without a task reference", () => {
    expect(() => taskCommandSchema.parse({ type: "complete_task" })).toThrow();
  });

  it("rejects an empty update", () => {
    expect(() => taskCommandSchema.parse({ type: "update_task", taskQuery: "report", patch: {} })).toThrow();
  });
});

describe("task reference resolution", () => {
  const tasks = [
    { id: "1", title: "Finish Q3 report", status: "not_started" as const },
    { id: "2", title: "Review Q3 budget", status: "not_started" as const },
    { id: "3", title: "Book dentist", status: "in_progress" as const },
  ];

  it("resolves a unique partial title", () => {
    expect(resolveTaskReference(tasks, { taskQuery: "dentist" })).toMatchObject({ kind: "resolved", task: { id: "3" } });
  });

  it("returns candidates instead of guessing an ambiguous reference", () => {
    const result = resolveTaskReference(tasks, { taskQuery: "Q3" });
    expect(result).toMatchObject({ kind: "ambiguous" });
    if (result.kind === "ambiguous") expect(result.candidates.map((task) => task.id)).toEqual(["1", "2"]);
  });

  it("reports a missing reference", () => {
    expect(resolveTaskReference(tasks, { taskQuery: "taxes" })).toEqual({ kind: "not_found" });
  });
});
