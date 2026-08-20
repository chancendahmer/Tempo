import { and, asc, eq, gt, ilike, inArray } from "drizzle-orm";
import { MessagingProvider } from "../../adapters/sms/sms-transport";
import { ReminderRepository, ReminderRecord } from "../../domain/reminder-service";
import { getDatabase, TempoDatabase } from "../client";
import { conversationMessages, reminders, scheduledActions } from "../schema";

function asRecord(row: typeof reminders.$inferSelect): ReminderRecord {
  return {
    id: row.id,
    text: row.text,
    remindAt: row.remindAt,
    timezone: row.timezone,
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
        idempotencyKey,
      }).onConflictDoNothing({ target: reminders.idempotencyKey }).returning();
      const reminder = created ?? (await transaction.select().from(reminders)
        .where(eq(reminders.idempotencyKey, idempotencyKey)).limit(1))[0];
      if (!reminder) throw new Error("Reminder idempotency conflict could not be resolved");
      await transaction.insert(scheduledActions).values({
        userId: input.userId,
        reminderId: reminder.id,
        kind: "deliver_reminder",
        payload: { reminderId: reminder.id },
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

  async cancel(input: Parameters<ReminderRepository["cancel"]>[0]) {
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

  async getDeliveryContext(reminderId: string) {
    const [row] = await this.database.select().from(reminders).where(and(
      eq(reminders.id, reminderId),
      inArray(reminders.status, ["scheduled", "sending", "failed"]),
    )).limit(1);
    return row ? { ...asRecord(row), userId: row.userId } : null;
  }

  async markSending(reminderId: string, now = new Date()) {
    const changed = await this.database.update(reminders).set({ status: "sending", updatedAt: now })
      .where(and(eq(reminders.id, reminderId), inArray(reminders.status, ["scheduled", "sending", "failed"]))).returning({ id: reminders.id });
    return changed.length > 0;
  }

  async markSent(reminderId: string, provider: MessagingProvider, providerMessageSid: string, now = new Date()) {
    await this.database.update(reminders).set({
      status: "sent", provider, providerMessageSid, sentAt: now, lastError: null, updatedAt: now,
    }).where(eq(reminders.id, reminderId));
  }

  async reconcileDelivery(reminderId: string) {
    const [row] = await this.database.select({
      status: reminders.status,
      provider: conversationMessages.provider,
      providerMessageSid: conversationMessages.providerMessageSid,
    }).from(reminders).leftJoin(conversationMessages, eq(conversationMessages.relatedReminderId, reminders.id))
      .where(eq(reminders.id, reminderId)).limit(1);
    if (!row) return "missing" as const;
    if (row.status === "sent") return "sent" as const;
    if (row.provider && row.providerMessageSid) {
      await this.markSent(reminderId, row.provider, row.providerMessageSid);
      return "sent" as const;
    }
    return "pending" as const;
  }

  async markFailed(reminderId: string, error: unknown, now = new Date()) {
    const message = error instanceof Error ? error.message : String(error);
    await this.database.update(reminders).set({
      status: "failed", lastError: message.slice(0, 500), updatedAt: now,
    }).where(eq(reminders.id, reminderId));
  }
}
