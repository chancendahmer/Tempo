import { and, asc, eq, inArray } from "drizzle-orm";
import { TaskMutation, TaskRecord, TaskRepository } from "../../domain/task-service";
import { getDatabase, TempoDatabase } from "../client";
import { goals, taskEvents, tasks } from "../schema";

function asTaskRecord(row: typeof tasks.$inferSelect): TaskRecord {
  return {
    id: row.id,
    goalId: row.goalId,
    title: row.title,
    status: row.status,
    estimatedMinutes: row.estimatedMinutes,
    dueAt: row.dueAt,
  };
}

function eventChanges(changes: TaskMutation): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(changes)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
  );
}

export class DrizzleTaskRepository implements TaskRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async findActionBySourceMessage(sourceMessageId: string) {
    const [row] = await this.database
      .select({ task: tasks, eventType: taskEvents.eventType })
      .from(taskEvents)
      .innerJoin(tasks, eq(tasks.id, taskEvents.taskId))
      .where(eq(taskEvents.sourceMessageId, sourceMessageId))
      .limit(1);
    return row ? { task: asTaskRecord(row.task), eventType: row.eventType } : null;
  }

  async create(input: Parameters<TaskRepository["create"]>[0]) {
    return this.database.transaction(async (transaction) => {
      if (input.goalId) {
        const [ownedGoal] = await transaction.select({ id: goals.id }).from(goals).where(and(
          eq(goals.id, input.goalId),
          eq(goals.userId, input.userId),
          eq(goals.status, "active"),
        )).limit(1);
        if (!ownedGoal) throw new Error("Goal not found or not owned by user");
      }
      const [created] = await transaction
        .insert(tasks)
        .values({
          userId: input.userId,
          sourceMessageId: input.sourceMessageId,
          title: input.title,
          estimatedMinutes: input.estimatedMinutes,
          dueAt: input.dueAt,
          goalId: input.goalId,
        })
        .returning();
      await transaction.insert(taskEvents).values({
        userId: input.userId,
        taskId: created.id,
        sourceMessageId: input.sourceMessageId,
        eventType: "created",
        changes: {
          title: created.title,
          estimatedMinutes: created.estimatedMinutes,
          dueAt: created.dueAt?.toISOString() ?? null,
          goalId: created.goalId,
        },
      });
      return asTaskRecord(created);
    });
  }

  async list(userId: string, status: "open" | "completed" | "all") {
    const statusFilter =
      status === "open"
        ? inArray(tasks.status, ["not_started", "in_progress"])
        : status === "completed"
          ? eq(tasks.status, "completed")
          : undefined;
    const rows = await this.database
      .select()
      .from(tasks)
      .where(statusFilter ? and(eq(tasks.userId, userId), statusFilter) : eq(tasks.userId, userId))
      .orderBy(asc(tasks.dueAt), asc(tasks.createdAt));
    return rows.map(asTaskRecord);
  }

  async listForResolution(userId: string) {
    const rows = await this.database
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), inArray(tasks.status, ["not_started", "in_progress"])))
      .orderBy(asc(tasks.createdAt));
    return rows.map(asTaskRecord);
  }

  async mutate(input: Parameters<TaskRepository["mutate"]>[0]) {
    return this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(tasks)
        .set({ ...input.changes, updatedAt: new Date() })
        .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, input.userId)))
        .returning();
      if (!updated) throw new Error("Task not found or not owned by user");

      await transaction.insert(taskEvents).values({
        userId: input.userId,
        taskId: input.taskId,
        sourceMessageId: input.sourceMessageId,
        eventType: input.eventType,
        changes: eventChanges(input.changes),
      });
      return asTaskRecord(updated);
    });
  }
}
