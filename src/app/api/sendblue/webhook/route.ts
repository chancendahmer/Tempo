import { parseSendblueWebhook, validateSendblueWebhook } from "@/server/adapters/sms/sendblue-webhook";
import { requireEnv } from "@/server/config/env";
import { DrizzleMessagingRepository } from "@/server/db/repositories/messaging-repository";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = requireEnv(["DATABASE_URL", "SENDBLUE_WEBHOOK_SECRET"]);
    const valid = validateSendblueWebhook({
      secret: env.SENDBLUE_WEBHOOK_SECRET!,
      providedSecret: request.headers.get("sb-signing-secret"),
    });
    if (!valid) {
      logger.warn({ path: new URL(request.url).pathname }, "rejected invalid Sendblue webhook secret");
      return new Response("Forbidden", { status: 403 });
    }

    const event = parseSendblueWebhook(await request.json() as unknown);
    const repository = new DrizzleMessagingRepository();
    if (event.kind === "inbound") {
      const result = await repository.ingestInbound(event.input);
      logger.info({ eventId: event.eventId, duplicate: result.duplicate }, "Sendblue inbound message accepted");
    } else if (event.kind === "delivery") {
      await repository.updateDelivery(event.input);
    } else {
      logger.info({ eventId: event.eventId, reason: event.reason }, "Sendblue webhook ignored safely");
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error({ err: error }, "Sendblue webhook failed");
    return new Response("Webhook processing failed", { status: 500 });
  }
}
