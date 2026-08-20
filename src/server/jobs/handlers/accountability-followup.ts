import { PgBoss } from "pg-boss";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { DrizzleInterventionRepository } from "../../db/repositories/intervention-repository";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { buildFollowupAccountabilityPrompt } from "../../domain/accountability";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { logger } from "../../observability/logger";
import { AccountabilityFollowupJob, JOB_NAMES } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";

export async function registerAccountabilityFollowupHandler(boss: PgBoss) {
  await boss.work<AccountabilityFollowupJob>(JOB_NAMES.accountabilityFollowup, { localConcurrency: 4 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      const interventions = new DrizzleInterventionRepository();
      if (!(await actions.markRunning(job.data.scheduledActionId))) continue;
      try {
        const context = await interventions.getAccountabilityFollowupContext(job.data.interventionId);
        if (!context) {
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        const result = await new SafeSmsSender(new DrizzleOutboundMessageRepository(), createMessagingTransport()).send({
          userId: context.userId,
          body: buildFollowupAccountabilityPrompt(),
          kind: "coach",
          idempotencyKey: `accountability-followup-sms:${context.interventionId}`,
          relatedInterventionId: context.interventionId,
        });
        if (result.sent || result.reason === "duplicate") {
          await interventions.markAccountabilityFollowupSent(context.interventionId);
          await actions.markCompleted(job.data.scheduledActionId);
        } else {
          await actions.markCancelled(job.data.scheduledActionId, result.reason);
        }
      } catch (error) {
        await actions.markFailed(job.data.scheduledActionId, error);
        logger.error({ err: error, interventionId: job.data.interventionId }, "accountability follow-up failed");
        throw error;
      }
    }
  });
}
