import { describe, expect, it } from "vitest";
import { parseTaskIntentResponse } from "./task-intent-parser";

describe("Anthropic task tool boundary", () => {
  it("validates a tool-use block into a command", () => {
    expect(
      parseTaskIntentResponse([
        {
          type: "tool_use",
          name: "create_task",
          input: { title: "Finish report", estimatedMinutes: 90, dueAt: "2026-08-21T17:00:00-04:00" },
        },
      ]),
    ).toEqual({
      kind: "command",
      command: {
        type: "create_task",
        title: "Finish report",
        estimatedMinutes: 90,
        dueAt: "2026-08-21T17:00:00-04:00",
      },
    });
  });

  it("rejects invalid model-generated structured actions", () => {
    expect(() =>
      parseTaskIntentResponse([{ type: "tool_use", name: "complete_task", input: {} }]),
    ).toThrow("A task reference is required");
  });

  it("validates goal tool use through the same deterministic boundary", () => {
    expect(parseTaskIntentResponse([{ type: "tool_use", name: "create_goal", input: { title: "Run a half marathon" } }]))
      .toEqual({ kind: "command", command: { type: "create_goal", title: "Run a half marathon" } });
    expect(() => parseTaskIntentResponse([{ type: "tool_use", name: "complete_goal", input: {} }]))
      .toThrow("A goal reference is required");
  });

  it("validates a calendar-aware task reschedule request", () => {
    expect(parseTaskIntentResponse([{
      type: "tool_use",
      name: "reschedule_task",
      input: { taskQuery: "report", afterToday: true },
    }])).toEqual({
      kind: "command",
      command: { type: "reschedule_task", taskQuery: "report", afterToday: true },
    });
  });

  it("rejects an unknown tool name", () => {
    expect(() => parseTaskIntentResponse([{ type: "tool_use", name: "delete_everything", input: {} }])).toThrow(
      "Unsupported task tool",
    );
  });

  it("returns a compact conversational response when no tool is used", () => {
    expect(parseTaskIntentResponse([{ type: "text", text: "That sounds heavy. Want to choose one tiny next step?" }])).toEqual({
      kind: "conversation",
      reply: "That sounds heavy. Want to choose one tiny next step?",
    });
  });
});
