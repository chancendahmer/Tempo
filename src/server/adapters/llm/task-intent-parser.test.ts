import { describe, expect, it } from "vitest";
import { parseTaskIntentResponse } from "./task-intent-parser";
import { isExplicitReminderRequest } from "../../domain/reminder-commands";

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

  it("validates an exact reminder instant through the same structured boundary", () => {
    expect(parseTaskIntentResponse([{
      type: "tool_use",
      name: "create_reminder",
      input: { text: "submit the report", remindAt: "2026-08-21T22:00:00-04:00" },
    }])).toEqual({
      kind: "command",
      command: { type: "create_reminder", text: "submit the report", remindAt: "2026-08-21T22:00:00-04:00" },
    });
  });

  it("recognizes explicit future outreach wording as reminder intent", () => {
    expect(isExplicitReminderRequest("Remind me tomorrow at 10 PM to call Mom")).toBe(true);
    expect(isExplicitReminderRequest("Text me Friday morning about the report")).toBe(true);
    expect(isExplicitReminderRequest("Check in with me in 20 minutes")).toBe(true);
    expect(isExplicitReminderRequest("I need to call Mom tomorrow")).toBe(false);
  });

  it("validates a structured durable memory action", () => {
    expect(parseTaskIntentResponse([{
      type: "tool_use",
      name: "remember_memory",
      input: { content: "Favorite food: pizza.", category: "preference" },
    }])).toEqual({
      kind: "command",
      command: { type: "remember_memory", content: "Favorite food: pizza.", category: "preference" },
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
