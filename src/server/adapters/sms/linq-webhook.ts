import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { DeliveryProviderMessage, InboundProviderMessage } from "../../domain/messaging";

const serviceSchema = z.enum(["iMessage", "RCS", "SMS"]);
const handleSchema = z.object({ handle: z.string().min(1) }).passthrough();
const textPartSchema = z.object({ type: z.literal("text"), value: z.string() }).passthrough();
const anyPartSchema = z.object({ type: z.string() }).passthrough();

const messageDataSchema = z.object({
  id: z.string().min(1).optional(),
  message_id: z.string().min(1).optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  service: serviceSchema.optional(),
  sender_handle: handleSchema.optional(),
  chat: z.object({
    is_group: z.boolean().default(false),
    owner_handle: handleSchema,
  }).passthrough().optional(),
  parts: z.array(z.union([textPartSchema, anyPartSchema])).optional(),
  code: z.union([z.number(), z.string()]).optional(),
  reason: z.string().optional(),
}).passthrough();

export const linqWebhookSchema = z.object({
  api_version: z.literal("v3"),
  webhook_version: z.literal("2026-02-03"),
  event_type: z.enum([
    "message.sent",
    "message.received",
    "message.delivered",
    "message.read",
    "message.failed",
  ]),
  event_id: z.string().min(1),
  created_at: z.iso.datetime({ offset: true }),
  trace_id: z.string().min(1),
  partner_id: z.string().min(1),
  data: messageDataSchema,
});

export type ParsedLinqWebhook =
  | { kind: "inbound"; input: InboundProviderMessage; eventId: string }
  | { kind: "delivery"; input: DeliveryProviderMessage; eventId: string }
  | { kind: "ignored"; reason: "group_chat" | "unsupported_content"; eventId: string };

function decodeSignature(value: string): Buffer | null {
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export function validateLinqWebhook(input: {
  secret: string;
  rawBody: string;
  webhookId: string | null;
  timestamp: string | null;
  signature: string | null;
  now?: Date;
}): boolean {
  if (!input.webhookId || !input.timestamp || !input.signature || !/^\d+$/.test(input.timestamp)) return false;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const sentSeconds = Number(input.timestamp);
  if (!Number.isSafeInteger(sentSeconds) || Math.abs(nowSeconds - sentSeconds) > 300) return false;

  try {
    const encodedSecret = input.secret.startsWith("whsec_") ? input.secret.slice(6) : input.secret;
    const key = Buffer.from(encodedSecret, "base64");
    if (key.length === 0) return false;
    const expected = createHmac("sha256", key)
      .update(`${input.webhookId}.${input.timestamp}.${input.rawBody}`)
      .digest();

    return input.signature.split(" ").some((candidate) => {
      if (!candidate.startsWith("v1,")) return false;
      const actual = decodeSignature(candidate.slice(3));
      return actual !== null && actual.length === expected.length && timingSafeEqual(actual, expected);
    });
  } catch {
    return false;
  }
}

export function parseLinqWebhook(raw: unknown): ParsedLinqWebhook {
  const event = linqWebhookSchema.parse(raw);
  const data = event.data;
  const providerMessageId = data.id ?? data.message_id;
  if (!providerMessageId) throw new Error("Linq message webhook is missing a message ID");

  if (event.event_type === "message.received") {
    if (!data.chat || !data.sender_handle) throw new Error("Linq inbound webhook is missing chat handles");
    if (data.chat.is_group) return { kind: "ignored", reason: "group_chat", eventId: event.event_id };
    const text = (data.parts ?? [])
      .filter((part): part is z.infer<typeof textPartSchema> => part.type === "text" && "value" in part)
      .map((part) => part.value.trim())
      .filter(Boolean)
      .join("\n");
    if (!text) return { kind: "ignored", reason: "unsupported_content", eventId: event.event_id };
    return {
      kind: "inbound",
      eventId: event.event_id,
      input: {
        provider: "linq",
        providerMessageId,
        from: data.sender_handle.handle,
        to: data.chat.owner_handle.handle,
        body: text,
        service: data.service,
      },
    };
  }

  const status = event.event_type === "message.sent"
    ? "sent"
    : event.event_type === "message.delivered" || event.event_type === "message.read"
      ? "delivered"
      : "failed";
  return {
    kind: "delivery",
    eventId: event.event_id,
    input: {
      provider: "linq",
      providerMessageId,
      status,
      errorCode: data.code === undefined ? undefined : String(data.code),
      errorMessage: data.reason,
    },
  };
}
