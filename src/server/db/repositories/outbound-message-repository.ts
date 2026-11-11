import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  evaluateMessagingPermission,
  OutboundMessageRepository,
  type OutboundSubmission,
} from "../../domain/outbound-messaging";
import { getDatabase, TempoDatabase } from "../client";
import { consentRecords, conversationMessages, conversations, messageRelations, providerMessageBindings, users } from "../schema";
import { ensureDirectConversation } from "./messaging-identity-repository";
import { applyPendingDeliveryReceipt, lockDeliveryReceipt } from "./delivery-receipts";

export class DrizzleOutboundMessageRepository implements OutboundMessageRepository {
  constructor(
    private readonly database: TempoDatabase = getDatabase(),
    private readonly allowSubmission?: (database: TempoDatabase, userId: string) => Promise<boolean>,
  ) {}

  async getPermission(userId: string) {
    const database = this.database;
    const [user, latestConsent] = await Promise.all([
      database
        .select({
          phoneE164: users.phoneE164,
          userStatus: users.status,
          pausedUntil: users.pausedUntil,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      database
        .select({ status: consentRecords.status })
        .from(consentRecords)
        .where(eq(consentRecords.userId, userId))
        .orderBy(desc(consentRecords.createdAt), desc(consentRecords.id))
        .limit(1),
    ]);

    if (!user[0]) return null;
    return {
      ...user[0],
      latestConsent: latestConsent[0]?.status ?? null,
    };
  }

  async reserve(input: Parameters<OutboundMessageRepository["reserve"]>[0]) {
    input = { ...input, replyToMessageId: input.replyToMessageId ?? input.sourceMessageId };
    const database = this.database;
    const [user] = await database.select({ phoneE164: users.phoneE164, phoneVerifiedAt: users.phoneVerifiedAt })
      .from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user) throw new Error("Cannot reserve an outbound message for an unknown Tempo user");
    const identity = await ensureDirectConversation(database, {
      userId: input.userId, phoneE164: user.phoneE164, phoneVerifiedAt: user.phoneVerifiedAt,
    });
    return database.transaction(async transaction => {
      if (input.replyToMessageId) {
        const [parent] = await transaction.select({ id: conversationMessages.id }).from(conversationMessages).where(and(
          eq(conversationMessages.id, input.replyToMessageId), eq(conversationMessages.userId, input.userId),
          eq(conversationMessages.conversationId, identity.conversationId), eq(conversationMessages.direction, "inbound"),
        )).limit(1);
        if (!parent) throw new Error("Invalid outbound reply source");
      }
      const [created] = await transaction.insert(conversationMessages).values({
        userId: input.userId, conversationId: identity.conversationId,
        idempotencyKey: input.idempotencyKey, direction: "outbound", kind: input.kind, status: "queued", outboundState: "reserved",
        body: input.body, contentParts: [{ type: "text", value: input.body }],
        relatedInterventionId: input.relatedInterventionId, relatedReminderId: input.relatedReminderId,
      }).onConflictDoNothing({ target: conversationMessages.idempotencyKey }).returning({ id: conversationMessages.id });
      // Lock duplicate reservations so the same reply cannot acquire two parents.
      const [message] = await transaction.select().from(conversationMessages)
        .where(eq(conversationMessages.idempotencyKey, input.idempotencyKey)).limit(1).for("update");
      if (!message || message.userId !== input.userId || message.conversationId !== identity.conversationId || message.direction !== "outbound" || message.body !== input.body) {
        throw new Error("Outbound idempotency conflict could not be resolved");
      }
      if (input.replyToMessageId) {
        const existing = await transaction.select({ target: messageRelations.targetMessageId }).from(messageRelations)
          .where(and(eq(messageRelations.sourceMessageId, message.id), eq(messageRelations.type, "reply")));
        if (existing.some(relation => relation.target !== input.replyToMessageId)) throw new Error("Conflicting outbound reply source");
        await transaction.insert(messageRelations).values({ conversationId: identity.conversationId,
          sourceMessageId: message.id, targetMessageId: input.replyToMessageId, type: "reply",
        }).onConflictDoNothing();
      }
      return { messageId: message.id, duplicate: !created, state: message.outboundState ?? "ambiguous" as const };
    });
  }

  async reservedBody(userId: string, idempotencyKey: string) {
    const [message] = await this.database.select({ body: conversationMessages.body }).from(conversationMessages)
      .where(and(eq(conversationMessages.userId, userId), eq(conversationMessages.idempotencyKey, idempotencyKey), eq(conversationMessages.direction, "outbound"))).limit(1);
    return message?.body;
  }

  async beginSubmission(messageId: string, now: Date): Promise<OutboundSubmission> {
    return this.database.transaction(async transaction => {
      // Serialize the final permission check and the durable submission start
      // with STOP, pause, and web consent. Release the lock before provider I/O.
      const [owner] = await transaction.select({ userId: users.id }).from(users)
        .innerJoin(conversationMessages, eq(conversationMessages.userId, users.id))
        .where(and(eq(conversationMessages.id, messageId), eq(conversationMessages.direction, "outbound")))
        .for("update", { of: users });
      if (!owner) return { status: "not_reserved" };
      const database = transaction as unknown as TempoDatabase;
      const permission = await new DrizzleOutboundMessageRepository(database).getPermission(owner.userId);
      const gate = evaluateMessagingPermission(permission, now);
      const blockedReason = !gate.allowed ? gate.reason
        : this.allowSubmission && !await this.allowSubmission(database, owner.userId) ? "suppressed" : undefined;
      const reservation = and(eq(conversationMessages.id, messageId), eq(conversationMessages.outboundState, "reserved"));
      if (blockedReason) {
        const rows = await transaction.update(conversationMessages).set({
          status: "cancelled",
          outboundState: "suppressed",
          providerErrorCode: `TEMPO_BLOCKED_${blockedReason.toUpperCase()}`,
          providerErrorMessage: `Outbound send blocked: ${blockedReason}`,
          updatedAt: now,
        }).where(reservation).returning({ id: conversationMessages.id });
        return rows.length ? { status: "blocked", reason: blockedReason } : { status: "not_reserved" };
      }
      const rows = await transaction.update(conversationMessages).set({
        outboundState: "submitting", submissionToken: randomUUID(), submissionStartedAt: now, updatedAt: now,
      }).where(reservation).returning({ id: conversationMessages.id });
      return rows.length ? { status: "started", phoneE164: permission!.phoneE164 } : { status: "not_reserved" };
    });
  }

  async markSubmitted(
    messageId: string,
    provider: Parameters<OutboundMessageRepository["markSubmitted"]>[1],
    providerMessageSid: string,
    service?: Parameters<OutboundMessageRepository["markSubmitted"]>[3],
    providerConversationId?: Parameters<OutboundMessageRepository["markSubmitted"]>[4],
    providerThreadId?: Parameters<OutboundMessageRepository["markSubmitted"]>[5],
    providerLineAddress?: Parameters<OutboundMessageRepository["markSubmitted"]>[6],
  ) {
    const now = new Date();
    await this.database.transaction(async (transaction) => {
      const [message] = await transaction.select({
        conversationId: conversationMessages.conversationId,
        userId: conversationMessages.userId,
        outboundState: conversationMessages.outboundState,
        provider: conversationMessages.provider,
        providerMessageSid: conversationMessages.providerMessageSid,
        phoneE164: users.phoneE164,
        phoneVerifiedAt: users.phoneVerifiedAt,
      }).from(conversationMessages)
        .innerJoin(users, eq(users.id, conversationMessages.userId))
        .where(and(eq(conversationMessages.id, messageId), eq(conversationMessages.direction, "outbound")))
        .for("update", { of: users });
      if (message?.outboundState === "accepted" && message.provider === provider && message.providerMessageSid === providerMessageSid) return;
      if (message?.outboundState !== "submitting") throw new Error("Provider acceptance has no matching submission attempt");
      const db = transaction as unknown as TempoDatabase;
      await lockDeliveryReceipt(db, provider, providerMessageSid);
      await transaction
        .update(conversationMessages)
        .set({ provider, providerService: service, providerMessageSid, outboundState: "accepted", status: "queued",
          providerErrorCode: null, providerErrorMessage: null, updatedAt: now })
        .where(eq(conversationMessages.id, messageId));
      const providerIdentity = providerLineAddress
        ? await ensureDirectConversation(db, {
          userId: message.userId,
          phoneE164: message.phoneE164,
          phoneVerifiedAt: message.phoneVerifiedAt,
          provider,
          providerLineAddress,
          providerConversationId,
          providerThreadId,
          service,
        })
        : undefined;
      await transaction.insert(providerMessageBindings).values({
        messageId,
        providerConversationId: providerIdentity?.providerConversationId,
        provider,
        externalMessageId: providerMessageSid,
        externalThreadId: providerThreadId,
        deliveryStatus: "queued",
        rawMetadata: providerConversationId ? { providerConversationId } : {},
      }).onConflictDoNothing({
        target: [providerMessageBindings.provider, providerMessageBindings.externalMessageId],
      });
      await applyPendingDeliveryReceipt(db, message.userId, provider, providerMessageSid, now);
      await transaction.update(conversations).set({ lastMessageAt: now, updatedAt: now })
        .where(eq(conversations.id, message.conversationId));
    });
  }

  async markFailed(messageId: string, error: unknown) {
    const definitelyRejected = typeof error === "object" && error !== null && "submissionOutcome" in error && error.submissionOutcome === "not_accepted";
    await this.database
      .update(conversationMessages)
      .set({
        status: "failed",
        outboundState: definitelyRejected ? "reserved" : "ambiguous",
        providerErrorCode: "TEMPO_PROVIDER_ERROR",
        providerErrorMessage: definitelyRejected ? "Provider rejected the submission before acceptance." : "Provider acceptance could not be verified.",
        updatedAt: new Date(),
      })
      .where(and(eq(conversationMessages.id, messageId), eq(conversationMessages.outboundState, "submitting"), isNull(conversationMessages.providerMessageSid)));
  }
}
