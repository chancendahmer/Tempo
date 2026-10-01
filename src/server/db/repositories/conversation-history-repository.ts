import { and, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
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
    // Keep PostgreSQL's microsecond precision when adjacent messages arrive in
    // the same JavaScript millisecond.
    const cutoff = sql`(select cutoff.created_at from conversation_messages cutoff where cutoff.id = ${input.beforeMessageId})`;

    const descending = await this.database.select({
      id: conversationMessages.id,
      direction: conversationMessages.direction,
      body: conversationMessages.body,
      createdAt: conversationMessages.createdAt,
    }).from(conversationMessages).where(and(
      eq(conversationMessages.conversationId, input.conversationId),
      or(sql`${conversationMessages.createdAt} <= ${cutoff}`, sql`exists (
        select 1 from message_relations relation join conversation_messages parent on parent.id = relation.target_message_id
        where relation.source_message_id = ${conversationMessages.id} and relation.type = 'reply'
          and parent.conversation_id = ${input.conversationId} and parent.direction = 'inbound'
          and parent.created_at <= ${cutoff} and parent.id <> ${input.beforeMessageId}
      )`),
      ne(conversationMessages.id, input.beforeMessageId),
      inArray(conversationMessages.kind, ["user", "coach"]),
      or(
        inArray(conversationMessages.status, ["processed", "sent", "delivered"]),
        // Provider acceptance is enough for conversational context; delivery callbacks
        // may arrive late or never. A reservation without a provider ID is not a reply.
        and(
          eq(conversationMessages.direction, "outbound"),
          eq(conversationMessages.status, "queued"),
          isNotNull(conversationMessages.providerMessageSid),
        ),
      ),
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
