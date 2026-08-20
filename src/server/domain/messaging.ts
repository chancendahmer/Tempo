import { MessagingCapabilities, MessagingProvider, MessagingService } from "../adapters/sms/sms-transport";

export type StoredMessageStatus = "queued" | "sent" | "delivered" | "undelivered" | "failed";

export type ComplianceKeyword = "START" | "STOP" | "HELP";

export type InboundProviderMessage = {
  provider: MessagingProvider;
  providerMessageId: string;
  from: string;
  to: string;
  body: string;
  complianceKeyword?: ComplianceKeyword;
  service?: MessagingService;
  providerConversationId?: string;
  providerThreadId?: string;
  replyToProviderMessageId?: string;
  contentParts?: Array<Record<string, unknown>>;
  capabilities?: MessagingCapabilities;
  rawMetadata?: Record<string, unknown>;
};

export type DeliveryProviderMessage = {
  provider: MessagingProvider;
  providerMessageId: string;
  status: StoredMessageStatus;
  errorCode?: string;
  errorMessage?: string;
  providerConversationId?: string;
  providerThreadId?: string;
  rawMetadata?: Record<string, unknown>;
};

export type ProviderMessagingEvent =
  | { type: "message.received"; eventId: string; message: InboundProviderMessage }
  | { type: "message.delivery_updated"; eventId: string; message: DeliveryProviderMessage }
  | {
    type: "reaction.added";
    eventId: string;
    provider: MessagingProvider;
    providerConversationId: string;
    providerMessageId: string;
    reaction: string;
    actorAddress?: string;
    rawMetadata?: Record<string, unknown>;
  }
  | {
    type: "poll.responded";
    eventId: string;
    provider: MessagingProvider;
    providerConversationId: string;
    providerPollId: string;
    providerOptionIds: string[];
    responderAddress?: string;
    rawMetadata?: Record<string, unknown>;
  }
  | {
    type: "conversation.updated";
    eventId: string;
    provider: MessagingProvider;
    providerConversationId: string;
    providerThreadId?: string;
    service?: MessagingService;
    capabilities?: MessagingCapabilities;
    rawMetadata?: Record<string, unknown>;
  };

export interface MessagingRepository {
  ingestInbound(input: InboundProviderMessage): Promise<{ duplicate: boolean }>;
  updateDelivery(input: DeliveryProviderMessage): Promise<void>;
}

export function mapTwilioDeliveryStatus(
  status: "queued" | "accepted" | "scheduled" | "sending" | "sent" | "delivered" | "undelivered" | "failed" | "read",
): StoredMessageStatus {
  switch (status) {
    case "delivered":
    case "read":
      return "delivered";
    case "undelivered":
      return "undelivered";
    case "failed":
      return "failed";
    case "sent":
    case "sending":
      return "sent";
    case "accepted":
    case "scheduled":
    case "queued":
      return "queued";
  }
}
