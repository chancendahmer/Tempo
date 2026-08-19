import { describe, expect, it, vi } from "vitest";
import {
  PendingTaskAction,
  TaskRecord,
  TaskRepository,
  executeTaskCommand,
  resolvePendingTaskChoice,
} from "./task-service";

function task(id: string, title: string): TaskRecord {
  return { id, title, status: "not_started", goalId: null, estimatedMinutes: null, dueAt: null };
}

function repository(tasks: TaskRecord[]): TaskRepository {
  return {
    findActionBySourceMessage: vi.fn(async () => null),
    create: vi.fn(async (input) => ({
      ...task("new", input.title),
      estimatedMinutes: input.estimatedMinutes ?? null,
      dueAt: input.dueAt ?? null,
    })),
    list: vi.fn(async () => tasks),
    listForResolution: vi.fn(async () => tasks),
    mutate: vi.fn(async (input) => ({ ...tasks.find((candidate) => candidate.id === input.taskId)!, ...input.changes })),
  };
}

const context = { userId: "user-1", sourceMessageId: "message-1", now: new Date("2026-08-18T12:00:00Z") };

describe("task service", () => {
  it("creates a task with source context", async () => {
    const store = repository([]);
    const result = await executeTaskCommand(
      store,
      { type: "create_task", title: "Finish report", estimatedMinutes: 60 },
      context,
    );

    expect(result).toMatchObject({ kind: "executed", reply: "Added: Finish report." });
    expect(store.create).toHaveBeenCalledWith({
      userId: "user-1",
      sourceMessageId: "message-1",
      title: "Finish report",
      estimatedMinutes: 60,
    });
  });

  it("does not mutate when a title is ambiguous", async () => {
    const store = repository([task("1", "Finish Q3 report"), task("2", "Review Q3 budget")]);
    const result = await executeTaskCommand(store, { type: "complete_task", taskQuery: "Q3" }, context);

    expect(result).toMatchObject({ kind: "needs_confirmation" });
    expect(store.mutate).not.toHaveBeenCalled();
  });

  it("completes a uniquely resolved task", async () => {
    const store = repository([task("1", "Finish Q3 report")]);
    const result = await executeTaskCommand(store, { type: "complete_task", taskQuery: "report" }, context);

    expect(result).toMatchObject({ kind: "executed", reply: "Done: Finish Q3 report." });
    expect(store.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        taskId: "1",
        sourceMessageId: "message-1",
        eventType: "completed",
      }),
    );
  });

  it("resolves a pending choice by number or unique title", () => {
    const pending: PendingTaskAction = {
      command: { type: "complete_task", taskQuery: "Q3" },
      candidates: [
        { id: "1", title: "Finish Q3 report" },
        { id: "2", title: "Review Q3 budget" },
      ],
    };

    expect(resolvePendingTaskChoice(pending, "2")).toEqual({ taskId: "2" });
    expect(resolvePendingTaskChoice(pending, "report")).toEqual({ taskId: "1" });
    expect(resolvePendingTaskChoice(pending, "Q3")).toMatchObject({ error: expect.any(String) });
  });
});
