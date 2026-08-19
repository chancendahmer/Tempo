import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { DeliveryProviderMessage, InboundProviderMessage, StoredMessageStatus } from "../../domain/messaging";

const serviceSchema = z.enum(["iMessage", "RCS", "SMS"]);
const sendblueWebhookSchema = z.object({
  content: z.string().nullish(),
  is_outbound: z.boolean(),
  status: z.string().min(1),
  error_code: z.union([z.number(), z.string()]).nullish(),
  error_message: z.string().nullish(),
  error_reason: z.string().nullish(),
  message_handle: z.string().min(1),
  from_number: z.string().nullish(),
  number: z.string().nullish(),
  to_number: z.string().nullish(),
  sendblue_number: z.string().nullish(),
  service: serviceSchema.nullish(),
  message_type: z.string().nullish(),
  group_id: z.string().nullish(),
}).passthrough();

export type ParsedSendblueWebhook =
  | { kind: "inbound"; input: InboundProviderMessage; eventId: string }
  | { kind: "delivery"; input: DeliveryProviderMessage; eventId: string }
  | { kind: "ignored"; reason: "group_chat" | "unsupported_content" | "unsupported_status"; eventId: string };

export function validateSendblueWebhook(input: { secret: string; providedSecret: string | null }): boolean {
  if (!input.providedSecret) return false;
  const expected = Buffer.from(input.secret, "utf8");
  const actual = Buffer.from(input.providedSecret, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function deliveryStatus(status: string): StoredMessageStatus | null {
  switch (status.toUpperCase()) {
    case "QUEUED":
    case "PENDING":
    case "ACCEPTED":
    case "REGISTERED":
      return "queued";
    case "SENT":
      return "sent";
    case "DELIVERED":
    case "READ":
      return "delivered";
    case "ERROR":
    case "DECLINED":
      return "failed";
    default:
      return null;
  }
}

export function parseSendblueWebhook(raw: unknown): ParsedSendblueWebhook {
  const event = sendblueWebhookSchema.parse(raw);
  const eventId = `${event.message_handle}:${event.status.toUpperCase()}`;

  if (!event.is_outbound) {
    if (event.message_type === "group" || event.group_id) {
      return { kind: "ignored", reason: "group_chat", eventId };
    }
    const body = event.content?.trim();
    if (!body) return { kind: "ignored", reason: "unsupported_content", eventId };
    const from = event.from_number ?? event.number;
    const to = event.to_number ?? event.sendblue_number;
    if (!from || !to) throw new Error("Sendblue inbound webhook is missing sender or recipient");
    return {
      kind: "inbound",
      eventId,
      input: {
        provider: "sendblue",
        providerMessageId: event.message_handle,
        from,
        to,
        body,
        service: event.service ?? undefined,
      },
    };
  }

  const status = deliveryStatus(event.status);
  if (!status) return { kind: "ignored", reason: "unsupported_status", eventId };
  return {
    kind: "delivery",
    eventId,
    input: {
      provider: "sendblue",
      providerMessageId: event.message_handle,
      status,
      errorCode: event.error_code === null || event.error_code === undefined ? undefined : String(event.error_code),
      errorMessage: event.error_reason ?? event.error_message ?? undefined,
    },
  };
}
