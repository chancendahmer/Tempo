import { PgBoss } from "pg-boss";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { getServerEnv } from "../../config/env";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { logger } from "../../observability/logger";
import { JOB_NAMES, SendComplianceJob } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "../../db/client";
import { scheduledActions } from "../../db/schema";

export async function registerSendComplianceHandler(boss: PgBoss) {
  await boss.work<SendComplianceJob>(JOB_NAMES.sendCompliance, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      if (!(await actions.markRunning(job.data.scheduledActionId))) continue;

      try {
        const env = getServerEnv();
        const sender = new SafeSmsSender(new DrizzleOutboundMessageRepository(), createMessagingTransport());
        const [action] = await getDatabase().select({ payload: scheduledActions.payload }).from(scheduledActions)
          .where(and(eq(scheduledActions.id, job.data.scheduledActionId), eq(scheduledActions.userId, job.data.userId)));
        const result = await sender.send({
          userId: job.data.userId,
          body: action?.payload.signInLinkRequired === true
            ? "To finish signing in, open the verification link in your Tempo text and tap Open my dashboard. If it expired, request another link on the website."
            : action?.payload.signInConfirmed === true
            ? "You’re verified. Return to the browser where you signed in—your Tempo dashboard is ready."
            : `Tempo helps you plan and start tasks. Reply with what you want to get done. Support: ${env.APP_BASE_URL}. Reply STOP to opt out.`,
          kind: "compliance",
          idempotencyKey: job.data.idempotencyKey,
        });

        if (result.sent || result.reason === "duplicate") {
          await actions.markCompleted(job.data.scheduledActionId);
        } else {
          await actions.markCancelled(job.data.scheduledActionId, result.reason);
        }
      } catch (error) {
        await actions.markFailed(job.data.scheduledActionId, error);
        logger.error({ err: error, jobId: job.id }, "compliance reply job failed");
        throw error;
      }
    }
  });
}
