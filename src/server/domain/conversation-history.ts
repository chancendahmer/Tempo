export type ConversationHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  replyToMessageId?: string;
  relatedReminder?: { id: string; text: string; remindAt: string };
  createdAt: Date;
};

/** The latest human turn and its direct reply, never an unsolicited output or
 * an older request before a human changed the subject. Callers supply history
 * already scoped to the current account's conversation. */
export function latestLinkedExchange(history: ConversationHistoryMessage[] = []) {
  let index = history.length - 1;
  while (index >= 0 && history[index].role !== "user") index -= 1;
  const request = history[index];
  if (!request) return;
  const reply = history.slice(index + 1).reverse().find(message => message.role === "assistant"
    && message.replyToMessageId === request.id);
  return reply ? { request, reply } : undefined;
}

export interface ConversationHistoryRepository {
  getRecent(input: {
    conversationId: string;
    beforeMessageId: string;
    limit: number;
  }): Promise<ConversationHistoryMessage[]>;
}
