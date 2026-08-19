import twilio from "twilio";
import { z } from "zod";

export const inboundTwilioMessageSchema = z.object({
  MessageSid: z.string().min(1),
  From: z.string().min(1),
  To: z.string().min(1),
  Body: z.string().max(4000).default(""),
  OptOutType: z.enum(["START", "STOP", "HELP"]).optional(),
});

export const deliveryTwilioMessageSchema = z.object({
  MessageSid: z.string().min(1),
  MessageStatus: z.enum(["queued", "accepted", "scheduled", "sending", "sent", "delivered", "undelivered", "failed", "read"]),
  ErrorCode: z.string().optional(),
  ErrorMessage: z.string().optional(),
});

export type InboundTwilioMessage = z.infer<typeof inboundTwilioMessageSchema>;
export type DeliveryTwilioMessage = z.infer<typeof deliveryTwilioMessageSchema>;

export function formDataToRecord(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

export function validateTwilioWebhook(input: {
  authToken: string;
  signature: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!input.signature) return false;
  return twilio.validateRequest(input.authToken, input.signature, input.url, input.params);
}

export function twilioWebhookUrl(appBaseUrl: string, pathname: string, search = ""): string {
  return new URL(`${pathname}${search}`, appBaseUrl).toString();
}

export function emptyTwimlResponse(): Response {
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
