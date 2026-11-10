import { PgBoss } from "pg-boss";
import { getServerEnv } from "../../config/env";
import { proactiveDeliveryEnabled } from "../../config/proactive-delivery";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { DrizzleInterventionRepository } from "../../db/repositories/intervention-repository";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { buildFollowupAccountabilityPrompt } from "../../domain/accountability";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { AccountabilityFollowupJob, JOB_NAMES } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";
import { failJob } from "../job-failure";

export async function registerAccountabilityFollowupHandler(boss: PgBoss) {
  await boss.work<AccountabilityFollowupJob>(JOB_NAMES.accountabilityFollowup, { localConcurrency: 4 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      const interventions = new DrizzleInterventionRepository();
      let running = false;
      try {
        running = await actions.markRunning(job.data.scheduledActionId);
        if (!running) continue;
        const context = await interventions.getAccountabilityFollowupContext(job.data.interventionId);
        if (!context) {
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        if (!proactiveDeliveryEnabled(getServerEnv(), context.userId)) {
          await actions.markCancelled(job.data.scheduledActionId, "proactive_delivery_disabled");
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
        await failJob(error, { jobId: job.id, operation: "Accountability follow-up", logMessage: "accountability follow-up failed",
          record: running ? retry => actions.markFailed(job.data.scheduledActionId, retry) : undefined });
      }
    }
  });
}
