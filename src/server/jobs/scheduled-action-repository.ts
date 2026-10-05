import { and, eq, inArray, or, lt, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { inDatabaseTransaction } from "../db/database-scope";
import { getDatabase, TempoDatabase } from "../db/client";
import { calendarConnections, scheduledActions, users } from "../db/schema";

export class ScheduledActionRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  private attempt?: { id: string; token: string; signal: AbortSignal };

  /** A pg-boss retry must acquire a new durable generation before changing state. */
  async claimRecurring(id: string, signal: AbortSignal, leaseMs: number, now = new Date()) {
    signal.throwIfAborted();
    const token = randomUUID();
    const rows = await this.database.update(scheduledActions).set({ status: "running", attemptToken: token,
      attemptExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now })
      .where(and(eq(scheduledActions.id, id), or(inArray(scheduledActions.status, ["scheduled", "failed"]),
        and(eq(scheduledActions.status, "running"), or(isNull(scheduledActions.attemptExpiresAt), lt(scheduledActions.attemptExpiresAt, now))))))
      .returning({ id: scheduledActions.id });
    if (!rows.length) {
      const [row] = await this.database.select({status: scheduledActions.status}).from(scheduledActions).where(eq(scheduledActions.id,id));
      if (row?.status === "running") throw new Error("Recurring job is still owned by another attempt");
      return null;
    }
    this.attempt = { id, token, signal };
    return { run: <T>(operation: () => Promise<T>) => this.withOwnership(operation) };
  }

  private owned(id: string) {
    this.attempt?.signal.throwIfAborted();
    return and(eq(scheduledActions.id,id), this.attempt ? eq(scheduledActions.attemptToken,this.attempt.token) : undefined);
  }

  private async withOwnership<T>(operation: () => Promise<T>) {
    const attempt = this.attempt;
    if (!attempt) throw new Error("Missing recurring job claim");
    attempt.signal.throwIfAborted();
    return this.database.transaction(async transaction => {
      const [row] = await transaction.select({id:scheduledActions.id}).from(scheduledActions)
        .where(and(this.owned(attempt.id), eq(scheduledActions.status,"running"))).for("update");
      if (!row) throw new Error("Recurring job ownership lost");
      const result = await inDatabaseTransaction(this.database, transaction as unknown as TempoDatabase, operation);
      attempt.signal.throwIfAborted();
      return result;
    });
  }

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
      .where(and(this.owned(id), inArray(scheduledActions.status, ["scheduled", "running", "failed"])));
  }

  async markCancelled(id: string, reason: string) {
    await this.database
      .update(scheduledActions)
      .set({ status: "cancelled", lastError: reason.slice(0, 500), updatedAt: new Date() })
      .where(and(this.owned(id), inArray(scheduledActions.status, ["scheduled", "running", "failed"])));
  }

  async markFailed(id: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.database
      .update(scheduledActions)
      .set({ status: "failed", lastError: message.slice(0, 500), updatedAt: new Date() })
      .where(and(this.owned(id), inArray(scheduledActions.status, ["scheduled", "running", "failed"])));
  }

  async completeAndScheduleCalendarSync(id: string, userId: string, runAt: Date) {
    await this.database.transaction(async (transaction) => {
      const now = new Date();
      const completed = await transaction.update(scheduledActions).set({
        status: "completed", completedAt: now, lastError: null, updatedAt: now,
      }).where(and(this.owned(id), inArray(scheduledActions.status, ["scheduled", "running", "failed"]))).returning({ id: scheduledActions.id });
      if (!completed.length) return;
      await transaction.update(scheduledActions).set({ status: "cancelled", updatedAt: now }).where(and(
        eq(scheduledActions.idempotencyKey, `recovery:${id}`),
        eq(scheduledActions.status, "scheduled"),
      ));
      await transaction.insert(scheduledActions).values({
        userId, kind: "sync_calendar", payload: {},
        idempotencyKey: `calendar-sync:after:${id}`, runAt,
      });
    });
  }

  async completeAndScheduleContextEvaluation(id: string, userId: string, runAt: Date) {
    await this.database.transaction(async (transaction) => {
      const now = new Date();
      const completed = await transaction.update(scheduledActions).set({
        status: "completed", completedAt: now, lastError: null, updatedAt: now,
      }).where(and(this.owned(id), inArray(scheduledActions.status, ["scheduled", "running", "failed"]))).returning({ id: scheduledActions.id });
      if (!completed.length) return;
      await transaction.update(scheduledActions).set({ status: "cancelled", updatedAt: now }).where(and(
        eq(scheduledActions.idempotencyKey, `recovery:${id}`),
        eq(scheduledActions.status, "scheduled"),
      ));
      await transaction.insert(scheduledActions).values({
        userId, kind: "evaluate_context", payload: {},
        idempotencyKey: `context-evaluation:after:${id}`, runAt,
      });
    });
  }

  async completeAndScheduleFeedback(id: string, userId: string, interventionId: string, runAt: Date) {
    await this.database.transaction(async (transaction) => {
      const now = new Date();
      const completed = await transaction.update(scheduledActions).set({
        status: "completed", completedAt: now, lastError: null, updatedAt: now,
      }).where(and(this.owned(id), inArray(scheduledActions.status, ["scheduled", "running", "failed"]))).returning({ id: scheduledActions.id });
      if (!completed.length) return;
      await transaction.insert(scheduledActions).values({
        userId, interventionId, kind: "feedback_followup", payload: { interventionId },
        idempotencyKey: `feedback:${interventionId}:start`, runAt,
      }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
    });
  }

  async completeAndScheduleFeedbackTimeout(id: string, userId: string, interventionId: string, runAt: Date) {
    await this.database.transaction(async (transaction) => {
      const now = new Date();
      const completed = await transaction.update(scheduledActions).set({
        status: "completed", completedAt: now, lastError: null, updatedAt: now,
      }).where(and(this.owned(id), inArray(scheduledActions.status, ["scheduled", "running", "failed"]))).returning({ id: scheduledActions.id });
      if (!completed.length) return;
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
    this.attempt?.signal.throwIfAborted();
    await this.database.transaction(async transaction => {
      const [parent] = await transaction.select({id: scheduledActions.id}).from(scheduledActions)
        .where(and(this.owned(input.failedActionId), eq(scheduledActions.userId,input.userId), eq(scheduledActions.status,"failed"))).for("update");
      if (!parent) return;
      await transaction.insert(scheduledActions).values({userId:input.userId, kind:input.kind, payload:{},
        idempotencyKey: `recovery:${input.failedActionId}`, runAt:input.runAt})
        .onConflictDoNothing({target:scheduledActions.idempotencyKey});
    });
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
