import { and, desc, eq, inArray, lte, ne } from "drizzle-orm";
import { ConversationHistoryRepository } from "../../domain/conversation-history";
import { getDatabase, TempoDatabase } from "../client";
import { conversationMessages, messageRelations } from "../schema";

export class DrizzleConversationHistoryRepository implements ConversationHistoryRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async getRecent(input: Parameters<ConversationHistoryRepository["getRecent"]>[0]) {
    const [boundary] = await this.database.select({ createdAt: conversationMessages.createdAt })
      .from(conversationMessages)
      .where(and(
        eq(conversationMessages.id, input.beforeMessageId),
        eq(conversationMessages.conversationId, input.conversationId),
      ))
      .limit(1);
    if (!boundary) return [];

    const descending = await this.database.select({
      id: conversationMessages.id,
      direction: conversationMessages.direction,
      body: conversationMessages.body,
      createdAt: conversationMessages.createdAt,
    }).from(conversationMessages).where(and(
      eq(conversationMessages.conversationId, input.conversationId),
      lte(conversationMessages.createdAt, boundary.createdAt),
      ne(conversationMessages.id, input.beforeMessageId),
      inArray(conversationMessages.kind, ["user", "coach"]),
      inArray(conversationMessages.status, ["processed", "sent", "delivered"]),
    )).orderBy(desc(conversationMessages.createdAt)).limit(Math.max(1, Math.min(input.limit, 30)));

    if (descending.length === 0) return [];
    const relations = await this.database.select({
      sourceMessageId: messageRelations.sourceMessageId,
      targetMessageId: messageRelations.targetMessageId,
    }).from(messageRelations).where(and(
      eq(messageRelations.type, "reply"),
      inArray(messageRelations.sourceMessageId, descending.map((message) => message.id)),
    ));
    const replyTargets = new Map(relations.map((relation) => [relation.sourceMessageId, relation.targetMessageId]));
    return descending.reverse().map((message) => ({
      id: message.id,
      role: message.direction === "inbound" ? "user" as const : "assistant" as const,
      content: message.body,
      replyToMessageId: replyTargets.get(message.id),
      createdAt: message.createdAt,
    }));
  }
}
