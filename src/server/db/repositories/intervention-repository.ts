import { and, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { MessagingProvider } from "../../adapters/sms/sms-transport";
import { InterventionOpportunityPlanner } from "../../domain/context-evaluation-service";
import { getDatabase, TempoDatabase } from "../client";
import { conversationMessages, interventionAccountability, interventionOutcomes, interventions, memoryEntries, scheduledActions, tasks, users } from "../schema";

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
};

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
    return {
      ...row,
      taskId: row.taskId,
      status: row.status as "candidate" | "queued",
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
        configuredCooldown: users.interventionCooldownMinutes,
      }).from(interventions).innerJoin(users, eq(users.id, interventions.userId))
        .where(eq(interventions.id, interventionId)).limit(1);
      if (!current || !["candidate", "queued"].includes(current.status)) return { claimed: false as const, reason: "not_candidate" };

      await transaction.execute(sql`select id from ${users} where id = ${current.userId} for update`);
      const cooldownMinutes = Math.max(5, current.configuredCooldown);
      const [recent] = await transaction.select({ id: interventions.id }).from(interventions).where(and(
        eq(interventions.userId, current.userId),
        ne(interventions.id, current.id),
        inArray(interventions.status, ["queued", "sent", "delivered", "responded", "expired"]),
        gt(interventions.createdAt, new Date(now.getTime() - cooldownMinutes * 60_000)),
      )).orderBy(desc(interventions.createdAt)).limit(1);
      if (recent) return { claimed: false as const, reason: "cooldown_active" };

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
    const [message] = await this.database.select({
      status: conversationMessages.status,
      sentAt: conversationMessages.sentAt,
      deliveredAt: conversationMessages.deliveredAt,
    }).from(conversationMessages).where(and(
      eq(conversationMessages.relatedInterventionId, interventionId),
      eq(conversationMessages.provider, provider),
      eq(conversationMessages.providerMessageSid, providerMessageSid),
    )).limit(1);
    const status = message?.status === "delivered"
      ? "delivered"
      : message?.status === "failed" || message?.status === "undelivered"
        ? "failed"
        : "sent";
    await this.database.update(interventions).set({
      status,
      provider,
      providerMessageSid,
      sentAt: message?.sentAt ?? now,
      ...(status === "delivered" ? { deliveredAt: message?.deliveredAt ?? now } : {}),
      updatedAt: now,
    }).where(eq(interventions.id, interventionId));
    return status;
  }

  async markCancelled(interventionId: string, now = new Date()) {
    await this.database.update(interventions).set({ status: "cancelled", cancelledAt: now, updatedAt: now })
      .where(eq(interventions.id, interventionId));
  }

  async markFailed(interventionId: string) {
    await this.database.update(interventions).set({ status: "failed", updatedAt: new Date() })
      .where(eq(interventions.id, interventionId));
  }

  async reconcileDelivery(interventionId: string) {
    const [row] = await this.database.select({
      id: interventions.id,
      userId: interventions.userId,
      style: interventions.style,
      interventionStatus: interventions.status,
      messageStatus: conversationMessages.status,
      provider: conversationMessages.provider,
      providerMessageSid: conversationMessages.providerMessageSid,
    }).from(interventions)
      .leftJoin(conversationMessages, eq(conversationMessages.relatedInterventionId, interventions.id))
      .where(eq(interventions.id, interventionId))
      .limit(1);
    if (!row || row.interventionStatus === "candidate") return null;
    if (["cancelled", "failed", "held_out"].includes(row.interventionStatus)) {
      return { kind: "terminal" as const, status: row.interventionStatus };
    }
    if (["responded", "expired"].includes(row.interventionStatus)) {
      return { kind: "complete" as const, status: row.interventionStatus };
    }
    if (row.providerMessageSid) {
      const status = row.messageStatus === "delivered" ? "delivered" : "sent";
      const now = new Date();
      await this.database.update(interventions).set({
        status,
        provider: row.provider,
        providerMessageSid: row.providerMessageSid,
        sentAt: now,
        ...(status === "delivered" ? { deliveredAt: now } : {}),
        updatedAt: now,
      }).where(eq(interventions.id, interventionId));
      return { kind: "submitted" as const, userId: row.userId, style: row.style };
    }
    if (row.messageStatus && ["cancelled", "failed", "undelivered"].includes(row.messageStatus)) {
      const status = row.messageStatus === "cancelled" ? "cancelled" : "failed";
      await this.database.update(interventions).set({ status, updatedAt: new Date() })
        .where(eq(interventions.id, interventionId));
      return { kind: "terminal" as const, status };
    }
    return null;
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
