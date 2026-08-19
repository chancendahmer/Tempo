import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase, TempoDatabase } from "../db/client";
import { calendarConnections, scheduledActions, users } from "../db/schema";

export class ScheduledActionRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async markRunning(id: string) {
    const claimed = await this.database
      .update(scheduledActions)
      .set({ status: "running", updatedAt: new Date() })
      .where(and(
        eq(scheduledActions.id, id),
        inArray(scheduledActions.status, ["scheduled", "running", "failed"]),
      ))
      .returning({ id: scheduledActions.id });
    return claimed.length > 0;
  }

  async markCompleted(id: string) {
    const now = new Date();
    await this.database
      .update(scheduledActions)
      .set({ status: "completed", completedAt: now, lastError: null, updatedAt: now })
      .where(and(eq(scheduledActions.id, id), inArray(scheduledActions.status, ["scheduled", "running", "failed"])));
  }

  async markCancelled(id: string, reason: string) {
    await this.database
      .update(scheduledActions)
      .set({ status: "cancelled", lastError: reason.slice(0, 500), updatedAt: new Date() })
      .where(and(eq(scheduledActions.id, id), inArray(scheduledActions.status, ["scheduled", "running", "failed"])));
  }

  async markFailed(id: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.database
      .update(scheduledActions)
      .set({ status: "failed", lastError: message.slice(0, 500), updatedAt: new Date() })
      .where(and(eq(scheduledActions.id, id), inArray(scheduledActions.status, ["scheduled", "running", "failed"])));
  }

  async completeAndScheduleCalendarSync(id: string, userId: string, runAt: Date) {
    await this.database.transaction(async (transaction) => {
      const now = new Date();
      await transaction.update(scheduledActions).set({
        status: "completed", completedAt: now, lastError: null, updatedAt: now,
      }).where(and(eq(scheduledActions.id, id), inArray(scheduledActions.status, ["scheduled", "running", "failed"])));
      await transaction.update(scheduledActions).set({ status: "cancelled", updatedAt: now }).where(and(
        eq(scheduledActions.idempotencyKey, `recovery:${id}`),
        eq(scheduledActions.status, "scheduled"),
      ));
      await transaction.insert(scheduledActions).values({
        userId, kind: "sync_calendar", payload: {},
        idempotencyKey: `calendar-sync:${userId}:${randomUUID()}`, runAt,
      });
    });
  }

  async completeAndScheduleContextEvaluation(id: string, userId: string, runAt: Date) {
    await this.database.transaction(async (transaction) => {
      const now = new Date();
      await transaction.update(scheduledActions).set({
        status: "completed", completedAt: now, lastError: null, updatedAt: now,
      }).where(and(eq(scheduledActions.id, id), inArray(scheduledActions.status, ["scheduled", "running", "failed"])));
      await transaction.update(scheduledActions).set({ status: "cancelled", updatedAt: now }).where(and(
        eq(scheduledActions.idempotencyKey, `recovery:${id}`),
        eq(scheduledActions.status, "scheduled"),
      ));
      await transaction.insert(scheduledActions).values({
        userId, kind: "evaluate_context", payload: {},
        idempotencyKey: `context-evaluation:${userId}:${randomUUID()}`, runAt,
      });
    });
  }

  async completeAndScheduleFeedback(id: string, userId: string, interventionId: string, runAt: Date) {
    await this.database.transaction(async (transaction) => {
      const now = new Date();
      await transaction.update(scheduledActions).set({
        status: "completed", completedAt: now, lastError: null, updatedAt: now,
      }).where(and(eq(scheduledActions.id, id), inArray(scheduledActions.status, ["scheduled", "running", "failed"])));
      await transaction.insert(scheduledActions).values({
        userId, interventionId, kind: "feedback_followup", payload: { interventionId },
        idempotencyKey: `feedback:${interventionId}:start`, runAt,
      }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
    });
  }

  async completeAndScheduleFeedbackTimeout(id: string, userId: string, interventionId: string, runAt: Date) {
    await this.database.transaction(async (transaction) => {
      const now = new Date();
      await transaction.update(scheduledActions).set({
        status: "completed", completedAt: now, lastError: null, updatedAt: now,
      }).where(and(eq(scheduledActions.id, id), inArray(scheduledActions.status, ["scheduled", "running", "failed"])));
      await transaction.insert(scheduledActions).values({
        userId, interventionId, kind: "feedback_timeout", payload: { interventionId },
        idempotencyKey: `feedback:${interventionId}:timeout`, runAt,
      }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
    });
  }

  async scheduleCalendarSync(userId: string, runAt: Date) {
    await this.database.insert(scheduledActions).values({
      userId,
      kind: "sync_calendar",
      payload: {},
      idempotencyKey: `calendar-sync:${userId}:${randomUUID()}`,
      runAt,
    });
  }

  async scheduleRecurringRecovery(input: {
    failedActionId: string;
    userId: string;
    kind: "sync_calendar" | "evaluate_context";
    runAt: Date;
  }) {
    await this.database.insert(scheduledActions).values({
      userId: input.userId,
      kind: input.kind,
      payload: {},
      idempotencyKey: `recovery:${input.failedActionId}`,
      runAt: input.runAt,
    }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
  }

  async scheduleContextEvaluation(userId: string, runAt: Date) {
    await this.database.insert(scheduledActions).values({
      userId,
      kind: "evaluate_context",
      payload: {},
      idempotencyKey: `context-evaluation:${userId}:${randomUUID()}`,
      runAt,
    });
  }

  async scheduleFeedbackFollowup(userId: string, interventionId: string, runAt: Date) {
    await this.database.insert(scheduledActions).values({
      userId,
      interventionId,
      kind: "feedback_followup",
      payload: { interventionId },
      idempotencyKey: `feedback:${interventionId}:start`,
      runAt,
    }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
  }

  async scheduleFeedbackTimeout(userId: string, interventionId: string, runAt: Date) {
    await this.database.insert(scheduledActions).values({
      userId,
      interventionId,
      kind: "feedback_timeout",
      payload: { interventionId },
      idempotencyKey: `feedback:${interventionId}:timeout`,
      runAt,
    }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
  }

  async seedMissingContextEvaluations(now = new Date()) {
    const [activeUsers, existing] = await Promise.all([
      this.database.select({ id: users.id }).from(users).where(eq(users.status, "active")),
      this.database.select({ userId: scheduledActions.userId }).from(scheduledActions).where(and(
        eq(scheduledActions.kind, "evaluate_context"),
        inArray(scheduledActions.status, ["scheduled", "running"]),
      )),
    ]);
    const existingIds = new Set(existing.map((item) => item.userId).filter(Boolean));
    const missing = activeUsers.filter((user) => !existingIds.has(user.id));
    if (missing.length > 0) {
      await this.database.insert(scheduledActions).values(missing.map((user) => ({
        userId: user.id,
        kind: "evaluate_context",
        payload: {},
        idempotencyKey: `context-evaluation:${user.id}:${randomUUID()}`,
        runAt: now,
      })));
    }
    return missing.length;
  }

  async seedMissingCalendarSyncs(now = new Date()) {
    const [connections, existing] = await Promise.all([
      this.database.select({ userId: calendarConnections.userId }).from(calendarConnections)
        .where(eq(calendarConnections.status, "active")),
      this.database.select({ userId: scheduledActions.userId }).from(scheduledActions).where(and(
        eq(scheduledActions.kind, "sync_calendar"),
        inArray(scheduledActions.status, ["scheduled", "running"]),
      )),
    ]);
    const existingIds = new Set(existing.map((item) => item.userId).filter(Boolean));
    const missing = connections.filter((connection) => !existingIds.has(connection.userId));
    if (missing.length > 0) {
      await this.database.insert(scheduledActions).values(missing.map((connection) => ({
        userId: connection.userId,
        kind: "sync_calendar",
        payload: {},
        idempotencyKey: `calendar-sync:${connection.userId}:${randomUUID()}`,
        runAt: now,
      })));
    }
    return missing.length;
  }
}
