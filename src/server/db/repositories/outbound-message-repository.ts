import { desc, eq } from "drizzle-orm";
import {
  OutboundBlockReason,
  OutboundMessageRepository,
} from "../../domain/outbound-messaging";
import { getDatabase, TempoDatabase } from "../client";
import { consentRecords, conversationMessages, users } from "../schema";

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
    const [created] = await database
      .insert(conversationMessages)
      .values({
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        direction: "outbound",
        kind: input.kind,
        status: "queued",
        body: input.body,
        relatedInterventionId: input.relatedInterventionId,
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
  ) {
    await this.database
      .update(conversationMessages)
      .set({ provider, providerService: service, providerMessageSid, status: "queued", updatedAt: new Date() })
      .where(eq(conversationMessages.id, messageId));
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
