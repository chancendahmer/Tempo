import { createHash } from "node:crypto";
import { itemReviews } from "../schema";
import { and, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { MessagingProvider } from "../../adapters/sms/sms-transport";
import { InterventionOpportunityPlanner } from "../../domain/context-evaluation-service";
import { localTime } from "../../domain/context-engine";
import { getDatabase, TempoDatabase } from "../client";
import { conversationMessages, interventionAccountability, interventionOutcomes, interventions, memoryEntries, scheduledActions, tasks, users } from "../schema";
import { DrizzleContextEngineRepository } from "./context-engine-repository";

export type InterventionDeliveryContext = {
  id: string;
  userId: string;
  taskId: string;
  style: "micro_start" | "direct_nudge" | "task_breakdown" | "body_doubling" | "reschedule";
  idempotencyKey: string;
  taskTitle: string;
  dueAt: Date | null;
  estimatedMinutes: number | null;
  coachingTone: "gentle" | "balanced" | "direct";
  memories: string[];
  status: "candidate" | "queued";
  messageText: string | null;
  draftVersion: string;
  staleDraft: boolean;
};

function draftVersion(title: string, dueAt?: Date | null, estimatedMinutes?: number | null) {
  const taskFingerprint = createHash("sha256").update(JSON.stringify([title, dueAt ?? null, estimatedMinutes ?? null])).digest("hex");
  return `intervention-v1:${taskFingerprint}`;
}

export class DrizzleInterventionRepository implements InterventionOpportunityPlanner {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async plan(input: Parameters<InterventionOpportunityPlanner["plan"]>[0]) {
    const idempotencyKey = `intervention:${input.snapshotId}`;
    return this.database.transaction(async (transaction) => {
      const [created] = await transaction.insert(interventions).values({
        userId: input.userId,
        taskId: input.taskId,
        contextSnapshotId: input.snapshotId,
        style: input.style,
        status: input.decision === "holdout" ? "held_out" : "candidate",
        idempotencyKey,
      }).onConflictDoNothing({ target: interventions.idempotencyKey }).returning({ id: interventions.id });
      const intervention = created ?? (await transaction.select({ id: interventions.id }).from(interventions)
        .where(eq(interventions.idempotencyKey, idempotencyKey)).limit(1))[0];
      if (!intervention) throw new Error("Intervention idempotency conflict could not be resolved");
      if (input.decision === "send" && created) {
        await transaction.insert(scheduledActions).values({
          userId: input.userId,
          interventionId: intervention.id,
          kind: "deliver_intervention",
          payload: { interventionId: intervention.id },
          idempotencyKey: `deliver:${intervention.id}`,
          runAt: input.now,
        });
      }
      return intervention.id;
    });
  }

  async getDeliveryContext(interventionId: string): Promise<InterventionDeliveryContext | null> {
    const [row] = await this.database.select({
      id: interventions.id,
      userId: interventions.userId,
      taskId: interventions.taskId,
      style: interventions.style,
      idempotencyKey: interventions.idempotencyKey,
      taskTitle: tasks.title,
      dueAt: tasks.dueAt,
      estimatedMinutes: tasks.estimatedMinutes,
      coachingTone: users.coachingTone,
      profileInstructions: users.profileInstructions,
      status: interventions.status,
      messageText: interventions.messageText,
      promptVersion: interventions.promptVersion,
    }).from(interventions)
      .innerJoin(tasks, eq(tasks.id, interventions.taskId))
      .innerJoin(users, eq(users.id, interventions.userId))
      .where(and(eq(interventions.id, interventionId), inArray(interventions.status, ["candidate", "queued"])))
      .limit(1);
    if (!row || !row.taskId) return null;
    const memories = await this.database.select({ id: memoryEntries.id, content: memoryEntries.content }).from(memoryEntries).where(and(
      eq(memoryEntries.userId, row.userId),
      inArray(memoryEntries.category, ["preference", "pattern", "intervention_learning"]),
      eq(memoryEntries.sensitivity, "normal"),
      isNull(memoryEntries.deletedAt),
      or(isNull(memoryEntries.expiresAt), gt(memoryEntries.expiresAt, new Date())),
    )).orderBy(desc(memoryEntries.confidence), desc(memoryEntries.lastConfirmedAt)).limit(5);
    if (memories.length > 0) {
      await this.database.update(memoryEntries).set({ lastReferencedAt: new Date(), updatedAt: new Date() })
        .where(inArray(memoryEntries.id, memories.map((memory) => memory.id)));
    }
    const version = draftVersion(row.taskTitle, row.dueAt, row.estimatedMinutes);
    return {
      ...row,
      taskId: row.taskId,
      status: row.status as "candidate" | "queued",
      draftVersion: version,
      staleDraft: Boolean(row.messageText && row.promptVersion !== version),
      memories: [
        ...(row.profileInstructions ? [`User-authored coaching instructions: ${row.profileInstructions}`] : []),
        ...memories.map((memory) => memory.content),
      ].slice(0, 6),
    };
  }

  async claimDelivery(interventionId: string, now = new Date()) {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction.select({
        id: interventions.id,
        userId: interventions.userId,
        status: interventions.status,
      }).from(interventions).innerJoin(users, eq(users.id, interventions.userId))
        .where(eq(interventions.id, interventionId)).limit(1);
      if (!current || !["candidate", "queued"].includes(current.status)) return { claimed: false as const, reason: "not_candidate" };

      await transaction.execute(sql`select id from ${users} where id = ${current.userId} for update`);
      const [user] = await transaction.select().from(users).where(eq(users.id, current.userId)).limit(1);
      if (!user?.proactiveOptIn) return { claimed: false as const, reason: "proactive_opt_in_missing" };
      const cooldownMinutes = Math.max(120, user.interventionCooldownMinutes);
      const today = localTime(now, user.timezone).date;
      const contactAt = sql<Date>`coalesce(${interventions.sentAt}, ${interventions.queuedAt}, ${interventions.createdAt})`.mapWith(interventions.createdAt);
      const contactSince = new Date(now.getTime() - Math.max(48 * 60, cooldownMinutes) * 60_000);
      const contacts = await transaction.select({ at: contactAt }).from(interventions).where(and(
        eq(interventions.userId, current.userId), ne(interventions.id, current.id),
        inArray(interventions.status, ["queued", "sent", "delivered", "responded", "expired"]),
        gt(contactAt, contactSince),
      ));
      const reviews = await transaction.select({ at: sql<Date>`coalesce(${itemReviews.sentAt}, ${itemReviews.createdAt})`.mapWith(itemReviews.createdAt) }).from(itemReviews).where(and(eq(itemReviews.userId, current.userId), inArray(itemReviews.status, ["reserved", "sent", "closed"]), or(gt(itemReviews.createdAt, contactSince), gt(itemReviews.sentAt, contactSince))));
      contacts.push(...reviews);
      if (contacts.filter(({ at }) => at && localTime(at, user.timezone).date === today).length >= Math.min(3, user.dailyInterventionCap)) {
        return { claimed: false as const, reason: "daily_cap_reached" };
      }
      const cooldownSince = new Date(now.getTime() - cooldownMinutes * 60_000);
      if (contacts.some(({ at }) => at > cooldownSince)) return { claimed: false as const, reason: "cooldown_active" };

      await transaction.update(interventions).set({ status: "queued", queuedAt: now, updatedAt: now })
        .where(and(eq(interventions.id, current.id), inArray(interventions.status, ["candidate", "queued"])));
      return { claimed: true as const, cooldownMinutes };
    });
  }

  async markQueued(interventionId: string, message: string, promptVersion: string, model: string) {
    await this.database.update(interventions).set({
      status: "queued", messageText: message, promptVersion, model, queuedAt: new Date(), updatedAt: new Date(),
    }).where(and(eq(interventions.id, interventionId), inArray(interventions.status, ["candidate", "queued"])));
  }

  /** The submission transaction holds the user lock and counts every other optional contact. */
  async canSubmitDelivery(interventionId: string, userId: string, now: Date, composedVersion: string) {
    const [current] = await this.database.select({ taskId: interventions.taskId }).from(interventions).where(and(
      eq(interventions.id, interventionId), eq(interventions.userId, userId), eq(interventions.status, "queued"),
    )).limit(1);
    if (!current?.taskId) return false;
    const result = await new DrizzleContextEngineRepository(this.database).evaluateDelivery(userId, interventionId, now);
    const task = result?.evaluation.task;
    return Boolean(result && result.evaluation.decision !== "blocked" && task?.id === current.taskId
      && draftVersion(task.title, task.dueAt, task.estimatedMinutes) === composedVersion);
  }

  async startAccountability(interventionId: string, now = new Date()) {
    await this.database.insert(interventionAccountability).values({
      interventionId,
      status: "awaiting_initial",
      lastPromptAt: now,
    }).onConflictDoNothing({ target: interventionAccountability.interventionId });
  }

  async getAccountabilityFollowupContext(interventionId: string, now = new Date()) {
    const [row] = await this.database.select({
      interventionId: interventions.id,
      userId: interventions.userId,
      taskTitle: tasks.title,
      accountabilityStatus: interventionAccountability.status,
    }).from(interventionAccountability)
      .innerJoin(interventions, eq(interventions.id, interventionAccountability.interventionId))
      .innerJoin(tasks, eq(tasks.id, interventions.taskId))
      .where(and(
        eq(interventionAccountability.interventionId, interventionId),
        inArray(interventionAccountability.status, ["snoozed", "followup_due"]),
        lte(interventionAccountability.snoozedUntil, now),
      )).limit(1);
    return row ?? null;
  }

  async markAccountabilityFollowupSent(interventionId: string, now = new Date()) {
    await this.database.update(interventionAccountability).set({
      status: "followup_sent", lastPromptAt: now, updatedAt: now,
    }).where(and(
      eq(interventionAccountability.interventionId, interventionId),
      inArray(interventionAccountability.status, ["snoozed", "followup_due"]),
    ));
  }

  async markSent(
    interventionId: string,
    providerMessageSid: string,
    now = new Date(),
    provider: MessagingProvider = "test",
  ) {
    return (await this.withDeliveryAccount(interventionId, (tx, userId) =>
      this.projectSubmission(tx, interventionId, userId, provider, providerMessageSid, now))) ?? "unavailable";
  }

  private async withDeliveryAccount<T>(interventionId: string, operation: (tx: TempoDatabase, userId: string) => Promise<T>) {
    return this.database.transaction(async transaction => {
      // The status callback takes the same account lock before updating the
      // message or intervention. Project from the locked account's latest receipt.
      const [owner] = await transaction.select({ id: users.id }).from(users)
        .innerJoin(interventions, eq(interventions.userId, users.id))
        .where(eq(interventions.id, interventionId)).for("update", { of: users });
      return owner ? operation(transaction as unknown as TempoDatabase, owner.id) : undefined;
    });
  }

  private async projectSubmission(transaction: TempoDatabase, interventionId: string, userId: string,
    provider: MessagingProvider, providerMessageSid: string, now: Date) {
    const [message] = await transaction.select({
      status: conversationMessages.status,
      sentAt: conversationMessages.sentAt,
      deliveredAt: conversationMessages.deliveredAt,
    }).from(conversationMessages).where(and(
      eq(conversationMessages.relatedInterventionId, interventionId),
      eq(conversationMessages.userId, userId),
      eq(conversationMessages.direction, "outbound"),
      eq(conversationMessages.provider, provider),
      eq(conversationMessages.providerMessageSid, providerMessageSid),
    )).limit(1);
    if (!message || !["queued", "sent", "delivered", "failed", "undelivered"].includes(message.status)) return null;
    const status = message.status === "delivered"
      ? "delivered"
      : message.status === "failed" || message.status === "undelivered"
        ? "failed"
        : "sent";
    const [projected] = await transaction.update(interventions).set({
      status: sql`case when ${interventions.status} = 'delivered' then ${interventions.status} else ${status}::intervention_status end`,
      provider,
      providerMessageSid,
      sentAt: message.sentAt ?? (status === "failed" ? undefined : sql`coalesce(${interventions.sentAt}, ${now}::timestamptz)`),
      ...(status === "delivered" ? { deliveredAt: message.deliveredAt ?? now } : {}),
      updatedAt: sql`greatest(${interventions.updatedAt}, ${now}::timestamptz)`,
    }).where(and(eq(interventions.id, interventionId), eq(interventions.userId, userId),
      inArray(interventions.status, ["queued", "sent", "delivered", "failed"]))).returning({ status: interventions.status });
    return projected?.status === "delivered" ? "delivered" : projected ? status : null;
  }

  async markCancelled(interventionId: string, now = new Date()) {
    await this.database.update(interventions).set({ status: "cancelled", cancelledAt: now, updatedAt: now })
      .where(and(eq(interventions.id, interventionId), inArray(interventions.status, ["candidate", "queued"])));
  }

  async markFailed(interventionId: string) {
    await this.database.update(interventions).set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(interventions.id, interventionId), inArray(interventions.status, ["candidate", "queued"])));
  }

  async reconcileDelivery(interventionId: string) {
    return (await this.withDeliveryAccount(interventionId, async (transaction, userId) => {
      const [row] = await transaction.select({
        style: interventions.style,
        interventionStatus: interventions.status,
        messageStatus: conversationMessages.status,
        outboundState: conversationMessages.outboundState,
        provider: conversationMessages.provider,
        providerMessageSid: conversationMessages.providerMessageSid,
      }).from(interventions)
        .leftJoin(conversationMessages, and(
          eq(conversationMessages.relatedInterventionId, interventions.id),
          eq(conversationMessages.userId, userId), eq(conversationMessages.direction, "outbound"),
          or(eq(conversationMessages.idempotencyKey, `intervention-sms:${interventionId}`), and(
            eq(conversationMessages.provider, interventions.provider),
            eq(conversationMessages.providerMessageSid, interventions.providerMessageSid),
          )),
        ))
        .where(and(eq(interventions.id, interventionId), eq(interventions.userId, userId)))
        .orderBy(sql`(${conversationMessages.idempotencyKey} = ${`intervention-sms:${interventionId}`}) desc nulls last`)
        .limit(1);
      if (!row || row.interventionStatus === "candidate") return null;
      if (["cancelled", "held_out"].includes(row.interventionStatus)) {
        return { kind: "terminal" as const, status: row.interventionStatus };
      }
      if (["responded", "expired"].includes(row.interventionStatus)) {
        return { kind: "complete" as const, status: row.interventionStatus };
      }
      const now = new Date();
      if (row.provider && row.providerMessageSid) {
        const status = await this.projectSubmission(transaction, interventionId, userId, row.provider, row.providerMessageSid, now);
        if (status === "failed") return { kind: "terminal" as const, status };
        if (status) return { kind: "submitted" as const, userId, style: row.style };
        return null;
      }
      if (row.outboundState === "submitting" || row.outboundState === "ambiguous") return { kind: "pending" as const };
      if (row.interventionStatus === "failed") return { kind: "terminal" as const, status: "failed" as const };
      if (row.messageStatus && ["cancelled", "failed", "undelivered"].includes(row.messageStatus)) {
        const status = row.messageStatus === "cancelled" ? "cancelled" : "failed";
        await transaction.update(interventions).set({ status, updatedAt: now })
          .where(and(eq(interventions.id, interventionId), eq(interventions.status, row.interventionStatus)));
        return { kind: "terminal" as const, status };
      }
      return null;
    })) ?? null;
  }

  async getFeedbackContext(interventionId: string) {
    const [row] = await this.database.select({
      id: interventions.id,
      userId: interventions.userId,
      style: interventions.style,
      status: interventions.status,
      startedAt: interventionOutcomes.startedAt,
      completedAt: interventionOutcomes.completedAt,
      helpful: interventionOutcomes.helpful,
    }).from(interventions)
      .leftJoin(interventionOutcomes, eq(interventionOutcomes.interventionId, interventions.id))
      .where(eq(interventions.id, interventionId)).limit(1);
    if (!row || !["sent", "delivered", "responded"].includes(row.status) || row.helpful !== null) return null;
    return { ...row, hasProgress: Boolean(row.startedAt || row.completedAt) };
  }
}
