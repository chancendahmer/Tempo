export type MessagingProvider = "sendblue" | "linq" | "twilio" | "test";
export type MessagingService = "iMessage" | "RCS" | "SMS";

export type MessagingCapabilities = {
  text: boolean;
  media: boolean;
  contactCards: boolean;
  reactions: boolean;
  typingIndicators: boolean;
  readReceipts: boolean;
  inlineReplies: boolean;
  groups: boolean;
  polls: boolean;
  voiceMessages: boolean;
  location: boolean;
  interactiveCards: boolean;
};

export const TEXT_ONLY_CAPABILITIES: MessagingCapabilities = {
  text: true,
  media: false,
  contactCards: false,
  reactions: false,
  typingIndicators: false,
  readReceipts: false,
  inlineReplies: false,
  groups: false,
  polls: false,
  voiceMessages: false,
  location: false,
  interactiveCards: false,
};

export type SendMessageInput = {
  to: string;
  body: string;
  idempotencyKey: string;
  statusCallbackUrl?: string;
  mediaUrl?: string;
  providerConversationId?: string;
  providerThreadId?: string;
  replyToProviderMessageId?: string;
};

export type SendMessageResult = {
  provider: MessagingProvider;
  providerMessageSid: string;
  status: string;
  service?: MessagingService;
  providerConversationId?: string;
  providerThreadId?: string;
  providerLineAddress?: string;
};

export type ReactionInput = {
  providerMessageId: string;
  reaction: string;
  idempotencyKey: string;
};

export type TypingInput = { providerConversationId: string; active: boolean };
export type MarkReadInput = { providerConversationId: string; providerMessageId?: string };
export type CreateGroupInput = { participants: string[]; title?: string; idempotencyKey: string };
export type SendPollInput = {
  providerConversationId: string;
  question: string;
  options: string[];
  allowsMultiple?: boolean;
  idempotencyKey: string;
};

export type ProviderActionResult = {
  provider: MessagingProvider;
  providerActionId: string;
  status: string;
};

export interface MessagingTransport {
  getCapabilities(service?: MessagingService): MessagingCapabilities;
  send(input: SendMessageInput): Promise<SendMessageResult>;
  sendReaction?(input: ReactionInput): Promise<ProviderActionResult>;
  setTyping?(input: TypingInput): Promise<void>;
  markRead?(input: MarkReadInput): Promise<void>;
  createGroup?(input: CreateGroupInput): Promise<{ providerConversationId: string }>;
  sendPoll?(input: SendPollInput): Promise<ProviderActionResult>;
}

export class TestMessagingTransport implements MessagingTransport {
  readonly sent: SendMessageInput[] = [];

  constructor(private readonly sidPrefix = "TEST") {}

  getCapabilities() {
    return { ...TEXT_ONLY_CAPABILITIES, media: true, contactCards: true };
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    this.sent.push(input);
    return {
      provider: "test",
      providerMessageSid: `${this.sidPrefix}${String(this.sent.length).padStart(6, "0")}`,
      status: "queued",
    };
  }
}

// Backward-compatible aliases while the rest of the product moves from SMS-only
// terminology to channel-neutral messaging.
export type SendSmsInput = SendMessageInput;
export type SendSmsResult = SendMessageResult;
export type SmsTransport = MessagingTransport;
export { TestMessagingTransport as TestSmsTransport };
