import { describe, expect, it, vi } from "vitest";
import { GoalRecord, GoalRepository, executeGoalCommand, resolvePendingGoalChoice } from "./goal-service";

function goal(id: string, title: string): GoalRecord {
  return { id, title, description: null, status: "active" };
}

function repository(records: GoalRecord[]): GoalRepository {
  return {
    findActionBySourceMessage: vi.fn(async () => null),
    create: vi.fn(async (input) => ({ ...goal("new", input.title), description: input.description ?? null })),
    list: vi.fn(async () => records),
    listForResolution: vi.fn(async () => records),
    mutate: vi.fn(async (input) => ({ ...records.find((item) => item.id === input.goalId)!, ...input.changes })),
  };
}

const context = { userId: "user-1", sourceMessageId: "message-1", now: new Date("2026-08-19T12:00:00Z") };

describe("goal service", () => {
  it("creates and source-contextualizes a goal", async () => {
    const store = repository([]);
    expect(await executeGoalCommand(store, { type: "create_goal", title: "Finish my degree" }, context))
      .toMatchObject({ kind: "executed", reply: "Goal added: Finish my degree." });
    expect(store.create).toHaveBeenCalledWith({
      userId: context.userId,
      sourceMessageId: context.sourceMessageId,
      title: "Finish my degree",
      description: undefined,
    });
  });

  it("requires confirmation before mutating an ambiguous goal", async () => {
    const store = repository([goal("1", "Run a half marathon"), goal("2", "Run a marathon")]);
    const result = await executeGoalCommand(store, { type: "complete_goal", goalQuery: "run" }, context);
    expect(result).toMatchObject({ kind: "needs_confirmation" });
    expect(store.mutate).not.toHaveBeenCalled();
    if (result.kind !== "needs_confirmation") throw new Error("Expected ambiguity");
    expect(resolvePendingGoalChoice(result.pending, "1")).toEqual({ goalId: "1" });
    expect(resolvePendingGoalChoice(result.pending, "half")).toEqual({ goalId: "1" });
  });
});
