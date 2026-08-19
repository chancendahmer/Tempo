import { requireEnv } from "@/server/config/env";
import { DrizzleMessagingRepository } from "@/server/db/repositories/messaging-repository";
import {
  deliveryTwilioMessageSchema,
  formDataToRecord,
  twilioWebhookUrl,
  validateTwilioWebhook,
} from "@/server/adapters/sms/twilio-webhook";
import { mapTwilioDeliveryStatus } from "@/server/domain/messaging";
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

    if (!valid) return new Response("Forbidden", { status: 403 });

    const input = deliveryTwilioMessageSchema.parse(params);
    await new DrizzleMessagingRepository().updateDelivery({
      provider: "twilio",
      providerMessageId: input.MessageSid,
      status: mapTwilioDeliveryStatus(input.MessageStatus),
      errorCode: input.ErrorCode,
      errorMessage: input.ErrorMessage,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error({ err: error }, "Twilio status webhook failed");
    return new Response("Webhook processing failed", { status: 500 });
  }
}
