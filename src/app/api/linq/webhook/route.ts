import { parseLinqWebhook, validateLinqWebhook } from "@/server/adapters/sms/linq-webhook";
import { requireEnv } from "@/server/config/env";
import { DrizzleMessagingRepository } from "@/server/db/repositories/messaging-repository";
import { logger } from "@/server/observability/logger";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = requireEnv(["DATABASE_URL", "LINQ_WEBHOOK_SECRET"]);
    const rawBody = await request.text();
    const valid = validateLinqWebhook({
      secret: env.LINQ_WEBHOOK_SECRET!,
      rawBody,
      webhookId: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    });
    if (!valid) {
      logger.warn({ path: new URL(request.url).pathname }, "rejected invalid Linq webhook signature");
      return new Response("Forbidden", { status: 403 });
    }

    const event = parseLinqWebhook(JSON.parse(rawBody) as unknown);
    const repository = new DrizzleMessagingRepository();
    if (event.kind === "inbound") {
      const result = await repository.ingestInbound(event.input);
      logger.info({ eventId: event.eventId, duplicate: result.duplicate }, "Linq inbound message accepted");
    } else if (event.kind === "delivery") {
      await repository.updateDelivery(event.input);
    } else {
      logger.info({ eventId: event.eventId, reason: event.reason }, "Linq webhook ignored safely");
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error({ err: error }, "Linq webhook failed");
    return new Response("Webhook processing failed", { status: 500 });
  }
}
