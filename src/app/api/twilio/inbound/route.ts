import { requireEnv } from "@/server/config/env";
import { DrizzleMessagingRepository } from "@/server/db/repositories/messaging-repository";
import {
  emptyTwimlResponse,
  formDataToRecord,
  inboundTwilioMessageSchema,
  twilioWebhookUrl,
  validateTwilioWebhook,
} from "@/server/adapters/sms/twilio-webhook";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = requireEnv(["DATABASE_URL", "TWILIO_AUTH_TOKEN"]);
    const params = formDataToRecord(await request.formData());
    const requestUrl = new URL(request.url);
    const canonicalUrl = twilioWebhookUrl(env.APP_BASE_URL, requestUrl.pathname, requestUrl.search);
    const valid = validateTwilioWebhook({
      authToken: env.TWILIO_AUTH_TOKEN!,
      signature: request.headers.get("x-twilio-signature"),
      url: canonicalUrl,
      params,
    });

    if (!valid) {
      logger.warn({ path: requestUrl.pathname }, "rejected invalid Twilio webhook signature");
      return new Response("Forbidden", { status: 403 });
    }

    const input = inboundTwilioMessageSchema.parse(params);
    const result = await new DrizzleMessagingRepository().ingestInbound({
      provider: "twilio",
      providerMessageId: input.MessageSid,
      from: input.From,
      to: input.To,
      body: input.Body,
      complianceKeyword: input.OptOutType,
      service: "SMS",
    });
    logger.info({ providerMessageSid: input.MessageSid, duplicate: result.duplicate }, "Twilio inbound message accepted");
    return emptyTwimlResponse();
  } catch (error) {
    logger.error({ err: error }, "Twilio inbound webhook failed");
    return new Response("Webhook processing failed", { status: 500 });
  }
}
