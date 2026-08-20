import { desc, eq } from "drizzle-orm";
import {
  OutboundBlockReason,
  OutboundMessageRepository,
} from "../../domain/outbound-messaging";
import { getDatabase, TempoDatabase } from "../client";
import { consentRecords, conversationMessages, conversations, providerMessageBindings, users } from "../schema";
import { ensureDirectConversation } from "./messaging-identity-repository";

export class DrizzleOutboundMessageRepository implements OutboundMessageRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

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
        .orderBy(desc(consentRecords.createdAt))
        .limit(1),
    ]);

    if (!user[0]) return null;
    return {
      ...user[0],
      latestConsent: latestConsent[0]?.status ?? null,
    };
  }

  async reserve(input: Parameters<OutboundMessageRepository["reserve"]>[0]) {
    const database = this.database;
    const [user] = await database.select({ phoneE164: users.phoneE164, phoneVerifiedAt: users.phoneVerifiedAt })
      .from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user) throw new Error("Cannot reserve an outbound message for an unknown Tempo user");
    const identity = await ensureDirectConversation(database, {
      userId: input.userId,
      phoneE164: user.phoneE164,
      phoneVerifiedAt: user.phoneVerifiedAt,
    });
    const [created] = await database
      .insert(conversationMessages)
      .values({
        userId: input.userId,
        conversationId: identity.conversationId,
        idempotencyKey: input.idempotencyKey,
        direction: "outbound",
        kind: input.kind,
        status: "queued",
        body: input.body,
        contentParts: [{ type: "text", value: input.body }],
        relatedInterventionId: input.relatedInterventionId,
        relatedReminderId: input.relatedReminderId,
      })
      .onConflictDoNothing({ target: conversationMessages.idempotencyKey })
      .returning({ id: conversationMessages.id });

    if (created) return { messageId: created.id, duplicate: false };

    const [existing] = await database
      .select({ id: conversationMessages.id })
      .from(conversationMessages)
      .where(eq(conversationMessages.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (!existing) throw new Error("Outbound idempotency conflict could not be resolved");
    return { messageId: existing.id, duplicate: true };
  }

  async cancel(messageId: string, reason: OutboundBlockReason) {
    await this.database
      .update(conversationMessages)
      .set({
        status: "cancelled",
        providerErrorCode: `TEMPO_BLOCKED_${reason.toUpperCase()}`,
        providerErrorMessage: `Outbound send blocked: ${reason}`,
        updatedAt: new Date(),
      })
      .where(eq(conversationMessages.id, messageId));
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
        phoneE164: users.phoneE164,
        phoneVerifiedAt: users.phoneVerifiedAt,
      }).from(conversationMessages)
        .innerJoin(users, eq(users.id, conversationMessages.userId))
        .where(eq(conversationMessages.id, messageId)).limit(1);
      await transaction
        .update(conversationMessages)
        .set({ provider, providerService: service, providerMessageSid, status: "queued", updatedAt: now })
        .where(eq(conversationMessages.id, messageId));
      const providerIdentity = message && providerLineAddress
        ? await ensureDirectConversation(transaction as unknown as TempoDatabase, {
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
      if (message) {
        await transaction.update(conversations).set({ lastMessageAt: now, updatedAt: now })
          .where(eq(conversations.id, message.conversationId));
      }
    });
  }

  async markFailed(messageId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.database
      .update(conversationMessages)
      .set({
        status: "failed",
        providerErrorCode: "TEMPO_PROVIDER_ERROR",
        providerErrorMessage: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(conversationMessages.id, messageId));
  }
}
