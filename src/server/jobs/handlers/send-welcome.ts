import { PgBoss } from "pg-boss";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { getServerEnv } from "../../config/env";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { logger } from "../../observability/logger";
import { JOB_NAMES, SendWelcomeJob } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";

const WELCOME_MESSAGE =
  "Hi, it’s Tempo. Tap the contact card to add me and keep my photo with this conversation. When it’s saved, reply DONE. If you get stuck, reply I NEED MORE HELP. Then we’ll finish onboarding in one more step. Msg frequency varies. Reply STOP to opt out or HELP for help.";

export async function registerSendWelcomeHandler(boss: PgBoss) {
  await boss.work<SendWelcomeJob>(JOB_NAMES.sendWelcome, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      if (!(await actions.markRunning(job.data.scheduledActionId))) continue;

      try {
        const env = getServerEnv();
        const sender = new SafeSmsSender(new DrizzleOutboundMessageRepository(), createMessagingTransport());
        const result = await sender.send({
          userId: job.data.userId,
          body: WELCOME_MESSAGE,
          kind: "system",
          idempotencyKey: job.data.idempotencyKey,
          ...(env.MESSAGING_PROVIDER === "sendblue"
            ? { mediaUrl: new URL("/tempo.vcf", env.APP_BASE_URL).toString() }
            : {}),
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
