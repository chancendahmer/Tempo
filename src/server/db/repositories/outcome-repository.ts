import { and, desc, eq, gt, ilike, inArray, isNull } from "drizzle-orm";
import { OutcomeRepository } from "../../domain/outcome-tracker";
import { getDatabase, TempoDatabase } from "../client";
import { contextSnapshots, interventionOutcomes, interventions, memoryEntries, scheduledActions, taskEvents, tasks, users } from "../schema";
import { localTime } from "../../domain/context-engine";

export class DrizzleOutcomeRepository implements OutcomeRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async findPending(userId: string, now: Date) {
    const [row] = await this.database.select({
      interventionId: interventions.id,
      taskId: interventions.taskId,
      startedAt: interventionOutcomes.startedAt,
      completedAt: interventionOutcomes.completedAt,
      style: interventions.style,
      snapshotInputs: contextSnapshots.inputs,
    }).from(interventions)
      .leftJoin(interventionOutcomes, eq(interventionOutcomes.interventionId, interventions.id))
      .innerJoin(contextSnapshots, eq(contextSnapshots.id, interventions.contextSnapshotId))
      .where(and(
        eq(interventions.userId, userId),
        inArray(interventions.status, ["sent", "delivered", "responded"]),
        gt(interventions.createdAt, new Date(now.getTime() - 24 * 3_600_000)),
        isNull(interventionOutcomes.helpful),
      )).orderBy(desc(interventions.createdAt)).limit(1);
    if (!row) return null;
    const proposed = (row.snapshotInputs as Record<string, unknown>).nextFreeAt;
    const proposedAt = typeof proposed === "string" && !Number.isNaN(new Date(proposed).getTime()) ? new Date(proposed) : null;
    return {
      interventionId: row.interventionId,
      taskId: row.taskId,
      hasProgress: Boolean(row.startedAt || row.completedAt),
      style: row.style,
      proposedAt,
    };
  }

  async findRecentForTask(userId: string, taskId: string, now: Date) {
    const [row] = await this.database.select({ id: interventions.id }).from(interventions).where(and(
      eq(interventions.userId, userId),
      eq(interventions.taskId, taskId),
      inArray(interventions.status, ["sent", "delivered", "responded"]),
      gt(interventions.createdAt, new Date(now.getTime() - 24 * 3_600_000)),
    )).orderBy(desc(interventions.createdAt)).limit(1);
    return row?.id ?? null;
  }

  async record(input: Parameters<OutcomeRepository["record"]>[0]) {
    await this.database.transaction(async (transaction) => {
      const [existing] = await transaction.select().from(interventionOutcomes)
        .where(eq(interventionOutcomes.interventionId, input.interventionId)).limit(1);
      const values = {
        interventionId: input.interventionId,
        sourceMessageId: input.sourceMessageId,
        source: input.source,
        userResponse: input.userResponse ?? existing?.userResponse,
        startedAt: input.startedAt ?? existing?.startedAt,
        completedAt: input.completedAt ?? existing?.completedAt,
        helpful: input.helpful ?? existing?.helpful,
        updatedAt: input.now,
      };
      await transaction.insert(interventionOutcomes).values(values).onConflictDoUpdate({
        target: interventionOutcomes.interventionId,
        set: values,
      });
      await transaction.update(interventions).set({ status: "responded", respondedAt: input.now, updatedAt: input.now })
        .where(eq(interventions.id, input.interventionId));

      const [intervention] = await transaction.select({
        userId: interventions.userId,
        style: interventions.style,
        taskId: interventions.taskId,
      }).from(interventions).where(eq(interventions.id, input.interventionId)).limit(1);
      if (!intervention) return;

      if (intervention.taskId && input.startedAt) {
        const eventType = input.completedAt ? "completed" : "started";
        const changedTasks = await transaction.update(tasks).set({
          status: input.completedAt ? "completed" : "in_progress",
          startedAt: input.startedAt,
          ...(input.completedAt ? { completedAt: input.completedAt } : {}),
          updatedAt: input.now,
        }).where(and(
          eq(tasks.id, intervention.taskId),
          inArray(tasks.status, input.completedAt ? ["not_started", "in_progress"] : ["not_started"]),
        )).returning({ id: tasks.id });
        if (changedTasks.length > 0) {
          await transaction.insert(taskEvents).values({
            userId: intervention.userId,
            taskId: intervention.taskId,
            sourceMessageId: input.sourceMessageId,
            eventType,
            changes: {
              status: input.completedAt ? "completed" : "in_progress",
              source: "intervention_reply",
            },
          }).onConflictDoNothing({ target: taskEvents.sourceMessageId });
        }
      }

      await this.refreshResponseStats(transaction as unknown as TempoDatabase, intervention.userId, input.now);

      if (input.helpful === undefined) {
        await transaction.update(scheduledActions).set({ runAt: new Date(input.now.getTime() + 60_000), updatedAt: input.now })
          .where(and(eq(scheduledActions.interventionId, input.interventionId), eq(scheduledActions.kind, "feedback_followup"), eq(scheduledActions.status, "scheduled")));
      } else {
        await transaction.update(scheduledActions).set({ status: "cancelled", completedAt: input.now, updatedAt: input.now })
          .where(and(eq(scheduledActions.interventionId, input.interventionId), eq(scheduledActions.kind, "feedback_followup"), eq(scheduledActions.status, "scheduled")));
        await this.updateLearning(transaction as unknown as TempoDatabase, intervention.userId, intervention.style, input);
      }
    });
  }

  async recordTimeout(interventionId: string, now: Date) {
    await this.database.transaction(async (transaction) => {
      const [intervention] = await transaction.select({ userId: interventions.userId, status: interventions.status })
        .from(interventions).where(eq(interventions.id, interventionId)).limit(1);
      if (!intervention || !["sent", "delivered"].includes(intervention.status)) return;
      await transaction.insert(interventionOutcomes).values({
        interventionId,
        source: "timeout",
        recordedAt: now,
        updatedAt: now,
      }).onConflictDoNothing({ target: interventionOutcomes.interventionId });
      await transaction.update(interventions).set({ status: "expired", updatedAt: now })
        .where(and(eq(interventions.id, interventionId), inArray(interventions.status, ["sent", "delivered"])));
      await this.refreshResponseStats(transaction as unknown as TempoDatabase, intervention.userId, now);
    });
  }

  async confirmReschedule(input: Parameters<OutcomeRepository["confirmReschedule"]>[0]) {
    return this.database.transaction(async (transaction) => {
      const [task] = await transaction.update(tasks).set({ dueAt: input.proposedAt, updatedAt: input.now })
        .where(eq(tasks.id, input.taskId)).returning({ userId: tasks.userId, title: tasks.title });
      if (!task) throw new Error("Task for reschedule intervention was not found");
      await transaction.insert(taskEvents).values({
        userId: task.userId,
        taskId: input.taskId,
        sourceMessageId: input.sourceMessageId,
        eventType: "updated",
        changes: { dueAt: input.proposedAt.toISOString(), source: "reschedule_intervention" },
      }).onConflictDoNothing({ target: taskEvents.sourceMessageId });
      await transaction.insert(interventionOutcomes).values({
        interventionId: input.interventionId,
        sourceMessageId: input.sourceMessageId,
        source: "explicit_reply",
        userResponse: "confirmed_reschedule",
        recordedAt: input.now,
        updatedAt: input.now,
      }).onConflictDoUpdate({
        target: interventionOutcomes.interventionId,
        set: { sourceMessageId: input.sourceMessageId, source: "explicit_reply", userResponse: "confirmed_reschedule", updatedAt: input.now },
      });
      await transaction.update(interventions).set({ status: "responded", respondedAt: input.now, updatedAt: input.now })
        .where(eq(interventions.id, input.interventionId));
      await transaction.update(interventions).set({ status: "cancelled", cancelledAt: input.now, updatedAt: input.now }).where(and(
        eq(interventions.taskId, input.taskId),
        inArray(interventions.status, ["candidate", "queued"]),
      ));
      await transaction.update(scheduledActions).set({ status: "cancelled", completedAt: input.now, updatedAt: input.now }).where(and(
        eq(scheduledActions.interventionId, input.interventionId),
        eq(scheduledActions.status, "scheduled"),
      ));
      return task.title;
    });
  }

  private async refreshResponseStats(database: TempoDatabase, userId: string, now: Date) {
    const [user, history] = await Promise.all([
      database.select({ timezone: users.timezone, responseStats: users.responseStats }).from(users).where(eq(users.id, userId)).limit(1),
      database.select({
        occurredAt: interventions.sentAt,
        fallbackAt: interventions.createdAt,
        respondedAt: interventions.respondedAt,
      }).from(interventions).where(and(
        eq(interventions.userId, userId),
        inArray(interventions.status, ["sent", "delivered", "responded", "expired"]),
        gt(interventions.createdAt, new Date(now.getTime() - 90 * 86_400_000)),
      )),
    ]);
    if (!user[0]) return;
    const counts: Record<string, { responses: number; total: number }> = {};
    for (const item of history) {
      const bucket = localTime(item.occurredAt ?? item.fallbackAt, user[0].timezone).bucket;
      counts[bucket] ??= { responses: 0, total: 0 };
      counts[bucket].total += 1;
      if (item.respondedAt) counts[bucket].responses += 1;
    }
    const byTimeBucket = Object.fromEntries(Object.entries(counts).map(([bucket, count]) => [bucket, count.total ? count.responses / count.total : 0]));
    const prior = user[0].responseStats as Record<string, unknown>;
    await database.update(users).set({ responseStats: { ...prior, byTimeBucket, bucketCounts: counts }, updatedAt: now })
      .where(eq(users.id, userId));
  }

  private async updateLearning(
    database: TempoDatabase,
    userId: string,
    style: typeof interventions.$inferSelect.style,
    input: Parameters<OutcomeRepository["record"]>[0],
  ) {
    const rows = await database.select({ helpful: interventionOutcomes.helpful }).from(interventionOutcomes)
      .innerJoin(interventions, eq(interventions.id, interventionOutcomes.interventionId))
      .where(and(eq(interventions.userId, userId), eq(interventions.style, style), inArray(interventionOutcomes.helpful, [true, false])));
    const helpfulCount = rows.filter((row) => row.helpful).length;
    const rate = rows.length === 0 ? 0 : helpfulCount / rows.length;
    const [user] = await database.select({ responseStats: users.responseStats }).from(users).where(eq(users.id, userId)).limit(1);
    const stats = (user?.responseStats ?? {}) as Record<string, unknown>;
    await database.update(users).set({
      responseStats: { ...stats, totalRatedInterventions: rows.length, helpfulRate: rate },
      updatedAt: input.now,
    }).where(eq(users.id, userId));
    if (rows.length < 2) return;

    const content = rate >= 0.6
      ? `${style.replaceAll("_", " ")} nudges have usually helped this user (${helpfulCount}/${rows.length} rated helpful).`
      : `${style.replaceAll("_", " ")} nudges have usually not helped this user (${helpfulCount}/${rows.length} rated helpful); prefer another approach.`;
    const [prior] = await database.select({ id: memoryEntries.id }).from(memoryEntries).where(and(
      eq(memoryEntries.userId, userId),
      eq(memoryEntries.category, "intervention_learning"),
      isNull(memoryEntries.deletedAt),
      ilike(memoryEntries.content, `${style.replaceAll("_", " ")}%`),
    )).orderBy(desc(memoryEntries.createdAt)).limit(1);
    const [created] = await database.insert(memoryEntries).values({
      userId,
      category: "intervention_learning",
      content,
      confidence: Math.min(0.95, 0.5 + rows.length * 0.1),
      sourceMessageId: input.sourceMessageId,
      evidenceCount: rows.length,
      lastConfirmedAt: input.now,
      expiresAt: new Date(input.now.getTime() + 90 * 86_400_000),
    }).returning({ id: memoryEntries.id });
    if (prior) {
      await database.update(memoryEntries).set({ supersededById: created.id, deletedAt: input.now, updatedAt: input.now })
        .where(eq(memoryEntries.id, prior.id));
    }
  }
}
