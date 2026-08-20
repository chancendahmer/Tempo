import { PgBoss } from "pg-boss";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { DrizzleReminderRepository } from "../../db/repositories/reminder-repository";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { logger } from "../../observability/logger";
import { DeliverReminderJob, JOB_NAMES } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";

export async function registerDeliverReminderHandler(boss: PgBoss) {
  await boss.work<DeliverReminderJob>(JOB_NAMES.deliverReminder, { localConcurrency: 4 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      const reminders = new DrizzleReminderRepository();
      if (!(await actions.markRunning(job.data.scheduledActionId))) continue;
      try {
        const reconciled = await reminders.reconcileDelivery(job.data.reminderId);
        if (reconciled === "sent" || reconciled === "missing") {
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        const reminder = await reminders.getDeliveryContext(job.data.reminderId);
        if (!reminder) {
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        await reminders.markSending(reminder.id);
        const result = await new SafeSmsSender(new DrizzleOutboundMessageRepository(), createMessagingTransport()).send({
          userId: reminder.userId,
          body: `Reminder: ${reminder.text}`,
          kind: "coach",
          idempotencyKey: `reminder-sms:${reminder.id}`,
          relatedReminderId: reminder.id,
        });
        if (result.sent) {
          await reminders.markSent(reminder.id, result.provider, result.providerMessageSid);
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        if (result.reason === "duplicate" && await reminders.reconcileDelivery(reminder.id) === "sent") {
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        await reminders.markFailed(reminder.id, result.reason);
        await actions.markCancelled(job.data.scheduledActionId, result.reason);
      } catch (error) {
        await reminders.markFailed(job.data.reminderId, error);
        await actions.markFailed(job.data.scheduledActionId, error);
        logger.error({ err: error, reminderId: job.data.reminderId }, "reminder delivery failed");
        throw error;
      }
    }
  });
}
