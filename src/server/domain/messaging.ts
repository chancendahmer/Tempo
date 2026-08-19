import { MessagingProvider } from "../adapters/sms/sms-transport";

export type StoredMessageStatus = "queued" | "sent" | "delivered" | "undelivered" | "failed";

export type ComplianceKeyword = "START" | "STOP" | "HELP";

export type InboundProviderMessage = {
  provider: MessagingProvider;
  providerMessageId: string;
  from: string;
  to: string;
  body: string;
  complianceKeyword?: ComplianceKeyword;
  service?: "iMessage" | "RCS" | "SMS";
};

export type DeliveryProviderMessage = {
  provider: MessagingProvider;
  providerMessageId: string;
  status: StoredMessageStatus;
  errorCode?: string;
  errorMessage?: string;
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
