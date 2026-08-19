import { PgBoss } from "pg-boss";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { DrizzleInterventionRepository } from "../../db/repositories/intervention-repository";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { logger } from "../../observability/logger";
import { FeedbackFollowupJob, JOB_NAMES } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";

export async function registerFeedbackFollowupHandler(boss: PgBoss) {
  await boss.work<FeedbackFollowupJob>(JOB_NAMES.feedbackFollowup, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      if (!(await actions.markRunning(job.data.scheduledActionId))) continue;
      try {
        const context = await new DrizzleInterventionRepository().getFeedbackContext(job.data.interventionId);
        if (!context) {
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        const body = context.hasProgress
          ? "Did that nudge help, or was it the wrong nudge?"
          : context.style === "body_doubling"
            ? "How did the 15-minute block go—did you get started?"
            : "Did you get started?";
        const result = await new SafeSmsSender(new DrizzleOutboundMessageRepository(), createMessagingTransport()).send({
          userId: context.userId,
          body,
          kind: "coach",
          idempotencyKey: `feedback-sms:${context.id}:${context.hasProgress ? "helpful" : "started"}`,
          relatedInterventionId: context.id,
        });
        if (result.sent || result.reason === "duplicate") {
          await actions.completeAndScheduleFeedbackTimeout(
            job.data.scheduledActionId,
            context.userId,
            context.id,
            new Date(Date.now() + 12 * 3_600_000),
          );
        } else await actions.markCancelled(job.data.scheduledActionId, result.reason);
      } catch (error) {
        await actions.markFailed(job.data.scheduledActionId, error);
        logger.error({ err: error, interventionId: job.data.interventionId }, "feedback follow-up failed");
        throw error;
      }
    }
  });
}
