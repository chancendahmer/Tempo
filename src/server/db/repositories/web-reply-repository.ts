import { and, eq } from "drizzle-orm";
import { getDatabase, TempoDatabase } from "../client";
import { conversationMessages, messageRelations } from "../schema";
import type { SendSafeSmsInput } from "../../domain/outbound-messaging";

/** Web replies enter shared history without invoking any carrier transport. */
export class WebReplySender {
  constructor(private readonly sourceMessageId: string, private readonly database: TempoDatabase = getDatabase()) {}
  async send(input: SendSafeSmsInput) {
    const owned = input.runOwned ?? (async <T>(operation: () => Promise<T>) => operation());
    return owned(async () => {
    const [source] = await this.database.select().from(conversationMessages).where(and(eq(conversationMessages.id, this.sourceMessageId), eq(conversationMessages.userId, input.userId))).limit(1);
    if (!source?.idempotencyKey?.startsWith(`web-chat:${input.userId}:`)) throw new Error("Invalid web reply source");
    await this.database.transaction(async transaction => {
      await transaction.insert(conversationMessages).values({ userId: input.userId, conversationId: source.conversationId, direction: "outbound", kind: "coach", status: "delivered", outboundState: "accepted", body: input.body, idempotencyKey: input.idempotencyKey, deliveredAt: new Date() }).onConflictDoNothing({ target: conversationMessages.idempotencyKey });
      const [reply] = await transaction.select().from(conversationMessages).where(and(eq(conversationMessages.idempotencyKey, input.idempotencyKey), eq(conversationMessages.userId, input.userId))).limit(1);
      if (!reply || !source.conversationId || reply.conversationId !== source.conversationId || reply.body !== input.body || reply.direction !== "outbound") throw new Error("Conflicting web reply");
      await transaction.insert(messageRelations).values({ conversationId: source.conversationId, sourceMessageId: reply.id, targetMessageId: source.id, type: "reply" }).onConflictDoNothing();
    });
    });
  }
}

export async function isWebMessage(messageId: string, database: TempoDatabase = getDatabase()) {
  const [source] = await database.select({ key: conversationMessages.idempotencyKey, userId: conversationMessages.userId }).from(conversationMessages).where(eq(conversationMessages.id, messageId)).limit(1);
  return Boolean(source?.key?.startsWith(`web-chat:${source.userId}:`));
}
