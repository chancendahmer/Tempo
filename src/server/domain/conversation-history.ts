export type ConversationHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  replyToMessageId?: string;
  createdAt: Date;
};

export interface ConversationHistoryRepository {
  getRecent(input: {
    conversationId: string;
    beforeMessageId: string;
    limit: number;
  }): Promise<ConversationHistoryMessage[]>;
}
