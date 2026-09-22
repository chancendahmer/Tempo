import { and, asc, eq, gt, ilike, inArray, sql } from "drizzle-orm";
import { MessagingProvider } from "../../adapters/sms/sms-transport";
import { nextRecurringOccurrence, ReminderRepository, ReminderRecord } from "../../domain/reminder-service";
import { getDatabase, TempoDatabase } from "../client";
import { conversationMessages, reminders, scheduledActions } from "../schema";

function asRecord(row: typeof reminders.$inferSelect): ReminderRecord {
  return {
    id: row.id,
    text: row.text,
    remindAt: row.remindAt,
    timezone: row.timezone,
    recurrence: row.recurrence,
    occurrenceCount: row.occurrenceCount,
    status: row.status,
  };
}

export class DrizzleReminderRepository implements ReminderRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async findBySourceMessage(sourceMessageId: string) {
    const [row] = await this.database.select().from(reminders)
      .where(eq(reminders.sourceMessageId, sourceMessageId)).limit(1);
    return row ? asRecord(row) : null;
  }

  async create(input: Parameters<ReminderRepository["create"]>[0]) {
    return this.database.transaction(async (transaction) => {
      const idempotencyKey = `reminder:${input.sourceMessageId}`;
      const [created] = await transaction.insert(reminders).values({
        userId: input.userId,
        taskId: input.taskId,
        sourceMessageId: input.sourceMessageId,
        text: input.text,
        remindAt: input.remindAt,
        timezone: input.timezone,
        recurrence: input.recurrence,
        idempotencyKey,
      }).onConflictDoNothing({ target: reminders.idempotencyKey }).returning();
      const reminder = created ?? (await transaction.select().from(reminders)
        .where(eq(reminders.idempotencyKey, idempotencyKey)).limit(1))[0];
      if (!reminder) throw new Error("Reminder idempotency conflict could not be resolved");
      await transaction.insert(scheduledActions).values({
        userId: input.userId,
        reminderId: reminder.id,
        kind: "deliver_reminder",
        payload: { reminderId: reminder.id, occurrenceAt: reminder.remindAt.toISOString() },
        idempotencyKey: `deliver-reminder:${reminder.id}`,
        runAt: reminder.remindAt,
      }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
      return asRecord(reminder);
    });
  }

  async listUpcoming(userId: string, now: Date) {
    const rows = await this.database.select().from(reminders).where(and(
      eq(reminders.userId, userId),
      inArray(reminders.status, ["scheduled", "sending"]),
      gt(reminders.remindAt, now),
    )).orderBy(asc(reminders.remindAt)).limit(50);
    return rows.map(asRecord);
  }

  async update(input: Parameters<NonNullable<ReminderRepository["update"]>>[0]) {
    if (!input.reminderId && !input.reminderQuery) return { kind: "not_found" as const };
    return this.database.transaction(async (transaction) => {
      const key = `reminder-update:${input.sourceMessageId}`;
      const [prior] = await transaction.select({ reminderId: scheduledActions.reminderId }).from(scheduledActions)
        .where(and(eq(scheduledActions.userId, input.userId), eq(scheduledActions.idempotencyKey, key))).limit(1);
      if (prior?.reminderId) {
        const [row] = await transaction.select().from(reminders).where(and(eq(reminders.id, prior.reminderId), eq(reminders.userId, input.userId))).limit(1);
        if (row) return { kind: "updated" as const, reminder: asRecord(row) };
      }
      const matches = await transaction.select().from(reminders).where(and(
        eq(reminders.userId, input.userId),
        input.remindAt ? inArray(reminders.status, ["scheduled", "failed"]) : inArray(reminders.status, ["scheduled", "sent", "failed", "completed"]),
        input.reminderId ? eq(reminders.id, input.reminderId) : ilike(reminders.text, `%${input.reminderQuery!.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`),
      )).orderBy(asc(reminders.remindAt)).limit(6).for("update");
      if (!matches.length) return { kind: "not_found" as const };
      if (matches.length > 1) return { kind: "ambiguous" as const, reminders: matches.map(asRecord) };
      const [changed] = await transaction.update(reminders).set(input.remindAt
        ? { remindAt: input.remindAt, status: "scheduled", lastError: null, updatedAt: input.now }
        : { status: "completed", updatedAt: input.now })
        .where(and(eq(reminders.id, matches[0].id), eq(reminders.userId, input.userId))).returning();
      await transaction.update(scheduledActions).set({ status: "cancelled", completedAt: input.now, updatedAt: input.now })
        .where(and(eq(scheduledActions.reminderId, changed.id), inArray(scheduledActions.status, ["scheduled", "failed"])));
      // The source-keyed action also records completed updates for retry recovery.
      await transaction.insert(scheduledActions).values({
        userId: input.userId, reminderId: changed.id, kind: "deliver_reminder",
        payload: { reminderId: changed.id, occurrenceAt: changed.remindAt.toISOString() },
        idempotencyKey: key, runAt: changed.remindAt,
        status: input.remindAt ? "scheduled" : "cancelled", completedAt: input.remindAt ? null : input.now,
      }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
      return { kind: "updated" as const, reminder: asRecord(changed) };
    });
  }

  async cancel(input: Parameters<ReminderRepository["cancel"]>[0]) {
    if (!input.reminderId && !input.reminderQuery) return { kind: "not_found" as const };
    const conditions = [eq(reminders.userId, input.userId), eq(reminders.status, "scheduled")];
    if (input.reminderId) conditions.push(eq(reminders.id, input.reminderId));
    else if (input.reminderQuery) conditions.push(ilike(reminders.text, `%${input.reminderQuery.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`));
    const matches = await this.database.select().from(reminders).where(and(...conditions)).orderBy(asc(reminders.remindAt)).limit(6);
    if (matches.length === 0) return { kind: "not_found" as const };
    if (matches.length > 1) return { kind: "ambiguous" as const, reminders: matches.map(asRecord) };
    const [cancelled] = await this.database.transaction(async (transaction) => {
      const changed = await transaction.update(reminders).set({
        status: "cancelled", cancelledAt: input.now, updatedAt: input.now,
      }).where(and(eq(reminders.id, matches[0].id), eq(reminders.status, "scheduled"))).returning();
      await transaction.update(scheduledActions).set({ status: "cancelled", completedAt: input.now, updatedAt: input.now })
        .where(and(eq(scheduledActions.reminderId, matches[0].id), eq(scheduledActions.status, "scheduled")));
      return changed;
    });
    return cancelled ? { kind: "cancelled" as const, reminder: asRecord(cancelled) } : { kind: "not_found" as const };
  }

  async getDeliveryContext(reminderId: string, occurrenceAt: Date) {
    const [row] = await this.database.select().from(reminders).where(and(
      eq(reminders.id, reminderId),
      eq(reminders.remindAt, occurrenceAt),
      inArray(reminders.status, ["scheduled", "sending", "failed"]),
    )).limit(1);
    return row ? { ...asRecord(row), userId: row.userId } : null;
  }

  async markSending(reminderId: string, occurrenceAt: Date, now = new Date()) {
    const changed = await this.database.update(reminders).set({ status: "sending", updatedAt: now })
      .where(and(
        eq(reminders.id, reminderId),
        eq(reminders.remindAt, occurrenceAt),
        inArray(reminders.status, ["scheduled", "sending", "failed"]),
      )).returning({ id: reminders.id });
    return changed.length > 0;
  }

  async markSent(reminderId: string, provider: MessagingProvider, providerMessageSid: string, now = new Date()) {
    await this.database.update(reminders).set({
      status: "sent", provider, providerMessageSid, sentAt: now, lastError: null, updatedAt: now,
    }).where(eq(reminders.id, reminderId));
  }

  private occurrenceIdempotencyKey(reminderId: string, occurrenceAt: Date) {
    return `reminder-sms:${reminderId}:${occurrenceAt.toISOString()}`;
  }

  async reconcileDelivery(reminderId: string, occurrenceAt: Date) {
    const [reminder] = await this.database.select().from(reminders).where(eq(reminders.id, reminderId)).limit(1);
    if (!reminder) return "missing" as const;
    const [message] = await this.database.select({
      provider: conversationMessages.provider,
      providerMessageSid: conversationMessages.providerMessageSid,
      status: conversationMessages.status,
    }).from(conversationMessages).where(eq(
      conversationMessages.idempotencyKey,
      this.occurrenceIdempotencyKey(reminderId, occurrenceAt),
    )).limit(1);
    if (!reminder.recurrence && reminder.status === "sent") return "sent" as const;
    if (message?.provider && message.providerMessageSid && ["queued", "sent", "delivered"].includes(message.status)) {
      await this.recordSuccessfulDelivery(
        { ...asRecord(reminder), userId: reminder.userId },
        occurrenceAt,
        message.provider,
        message.providerMessageSid,
      );
      return "sent" as const;
    }
    return "pending" as const;
  }

  async recordSuccessfulDelivery(
    reminder: ReminderRecord & { userId: string },
    occurrenceAt: Date,
    provider: MessagingProvider,
    providerMessageSid: string,
    now = new Date(),
  ) {
    if (!reminder.recurrence) {
      await this.markSent(reminder.id, provider, providerMessageSid, now);
      return null;
    }
    const next = nextRecurringOccurrence(occurrenceAt, reminder.timezone, reminder.recurrence, now);
    return this.database.transaction(async (transaction) => {
      const [advanced] = await transaction.update(reminders).set({
        status: "scheduled",
        remindAt: next,
        occurrenceCount: sql`${reminders.occurrenceCount} + 1`,
        provider,
        providerMessageSid,
        sentAt: now,
        lastError: null,
        updatedAt: now,
      }).where(and(
        eq(reminders.id, reminder.id),
        eq(reminders.remindAt, occurrenceAt),
        eq(reminders.status, "sending"),
      )).returning({ id: reminders.id });
      if (!advanced) return null;
      await transaction.insert(scheduledActions).values({
        userId: reminder.userId,
        reminderId: reminder.id,
        kind: "deliver_reminder",
        payload: { reminderId: reminder.id, occurrenceAt: next.toISOString() },
        idempotencyKey: `deliver-reminder:${reminder.id}:${next.toISOString()}`,
        runAt: next,
      }).onConflictDoNothing({ target: scheduledActions.idempotencyKey });
      return next;
    });
  }

  getOccurrenceIdempotencyKey(reminderId: string, occurrenceAt: Date) {
    return this.occurrenceIdempotencyKey(reminderId, occurrenceAt);
  }

  async markFailed(reminderId: string, error: unknown, now = new Date()) {
    const message = error instanceof Error ? error.message : String(error);
    await this.database.update(reminders).set({
      status: "failed", lastError: message.slice(0, 500), updatedAt: now,
    }).where(eq(reminders.id, reminderId));
  }
}
