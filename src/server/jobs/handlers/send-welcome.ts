import { PgBoss } from "pg-boss";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { logger } from "../../observability/logger";
import { JOB_NAMES, SendWelcomeJob } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";

const WELCOME_MESSAGE =
  "Hi, it’s Tempo. I’ll text when it seems useful and help you take the next step. Msg frequency varies. Reply STOP to opt out or HELP for help. What’s one thing you want to get done?";

export async function registerSendWelcomeHandler(boss: PgBoss) {
  await boss.work<SendWelcomeJob>(JOB_NAMES.sendWelcome, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      if (!(await actions.markRunning(job.data.scheduledActionId))) continue;

      try {
        const sender = new SafeSmsSender(new DrizzleOutboundMessageRepository(), createMessagingTransport());
        const result = await sender.send({
          userId: job.data.userId,
          body: WELCOME_MESSAGE,
          kind: "system",
          idempotencyKey: job.data.idempotencyKey,
        });

        if (result.sent || result.reason === "duplicate") {
          await actions.markCompleted(job.data.scheduledActionId);
        } else {
          await actions.markCancelled(job.data.scheduledActionId, result.reason);
        }
      } catch (error) {
        await actions.markFailed(job.data.scheduledActionId, error);
        logger.error({ err: error, jobId: job.id }, "welcome SMS job failed");
        throw error;
      }
    }
  });
}
