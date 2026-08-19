import { and, asc, eq, inArray } from "drizzle-orm";
import { GoalMutation, GoalRecord, GoalRepository } from "../../domain/goal-service";
import { getDatabase, TempoDatabase } from "../client";
import { goalEvents, goals } from "../schema";

function asGoalRecord(row: typeof goals.$inferSelect): GoalRecord {
  return { id: row.id, title: row.title, description: row.description, status: row.status };
}

function eventChanges(changes: GoalMutation): Record<string, unknown> {
  return Object.fromEntries(Object.entries(changes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));
}

export class DrizzleGoalRepository implements GoalRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async findActionBySourceMessage(sourceMessageId: string) {
    const [row] = await this.database.select({ goal: goals, eventType: goalEvents.eventType })
      .from(goalEvents)
      .innerJoin(goals, eq(goals.id, goalEvents.goalId))
      .where(eq(goalEvents.sourceMessageId, sourceMessageId))
      .limit(1);
    return row ? { goal: asGoalRecord(row.goal), eventType: row.eventType } : null;
  }

  async create(input: Parameters<GoalRepository["create"]>[0]) {
    return this.database.transaction(async (transaction) => {
      const [created] = await transaction.insert(goals).values({
        userId: input.userId,
        sourceMessageId: input.sourceMessageId,
        title: input.title,
        description: input.description,
      }).returning();
      await transaction.insert(goalEvents).values({
        userId: input.userId,
        goalId: created.id,
        sourceMessageId: input.sourceMessageId,
        eventType: "created",
        changes: { title: created.title, description: created.description },
      });
      return asGoalRecord(created);
    });
  }

  async list(userId: string, status: "active" | "completed" | "all") {
    const statusFilter = status === "all" ? undefined : eq(goals.status, status);
    const rows = await this.database.select().from(goals)
      .where(statusFilter ? and(eq(goals.userId, userId), statusFilter) : eq(goals.userId, userId))
      .orderBy(asc(goals.createdAt));
    return rows.map(asGoalRecord);
  }

  async listForResolution(userId: string) {
    const rows = await this.database.select().from(goals)
      .where(and(eq(goals.userId, userId), inArray(goals.status, ["active"])))
      .orderBy(asc(goals.createdAt));
    return rows.map(asGoalRecord);
  }

  async mutate(input: Parameters<GoalRepository["mutate"]>[0]) {
    return this.database.transaction(async (transaction) => {
      const [updated] = await transaction.update(goals).set({ ...input.changes, updatedAt: new Date() })
        .where(and(eq(goals.id, input.goalId), eq(goals.userId, input.userId)))
        .returning();
      if (!updated) throw new Error("Goal not found or not owned by user");
      await transaction.insert(goalEvents).values({
        userId: input.userId,
        goalId: input.goalId,
        sourceMessageId: input.sourceMessageId,
        eventType: input.eventType,
        changes: eventChanges(input.changes),
      });
      return asGoalRecord(updated);
    });
  }
}
