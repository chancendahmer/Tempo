import { describe, expect, it } from "vitest";
import { goalCommandSchema, parseGoalCommandHeuristically, resolveGoalReference } from "./goal-commands";

describe("goal commands", () => {
  it("recognizes common create, list, complete, and abandon phrases", () => {
    expect(parseGoalCommandHeuristically("My goal is to run a half marathon")).toEqual({
      type: "create_goal", title: "run a half marathon",
    });
    expect(parseGoalCommandHeuristically("list my goals")).toEqual({ type: "list_goals", status: "active" });
    expect(parseGoalCommandHeuristically("I achieved my goal run a half marathon")).toEqual({
      type: "complete_goal", goalQuery: "run a half marathon",
    });
    expect(parseGoalCommandHeuristically("drop my goal to learn French")).toEqual({
      type: "abandon_goal", goalQuery: "learn French",
    });
  });

  it("requires references and non-empty updates", () => {
    expect(() => goalCommandSchema.parse({ type: "complete_goal" })).toThrow("A goal reference is required");
    expect(() => goalCommandSchema.parse({ type: "update_goal", goalQuery: "fitness", patch: {} }))
      .toThrow("At least one goal update is required");
  });

  it("never guesses between ambiguous goal titles", () => {
    const goals = [
      { id: "1", title: "Run a half marathon", status: "active" as const },
      { id: "2", title: "Run a marathon", status: "active" as const },
    ];
    expect(resolveGoalReference(goals, { goalQuery: "half" })).toMatchObject({ kind: "resolved", goal: { id: "1" } });
    expect(resolveGoalReference(goals, { goalQuery: "run" })).toMatchObject({ kind: "ambiguous" });
  });
});
