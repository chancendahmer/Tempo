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
        const occurrenceAt = new Date(job.data.occurrenceAt);
        const reconciled = await reminders.reconcileDelivery(job.data.reminderId, occurrenceAt);
        if (reconciled === "sent" || reconciled === "missing") {
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        const reminder = await reminders.getDeliveryContext(job.data.reminderId, occurrenceAt);
        if (!reminder) {
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        if (!(await reminders.markSending(reminder.id, occurrenceAt))) {
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        const result = await new SafeSmsSender(new DrizzleOutboundMessageRepository(), createMessagingTransport()).send({
          userId: reminder.userId,
          body: `Reminder: ${reminder.text}`,
          kind: "coach",
          idempotencyKey: reminders.getOccurrenceIdempotencyKey(reminder.id, occurrenceAt),
          relatedReminderId: reminder.id,
        });
        if (result.sent) {
          await reminders.recordSuccessfulDelivery(reminder, occurrenceAt, result.provider, result.providerMessageSid);
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        if (result.reason === "duplicate") {
          if (await reminders.reconcileDelivery(reminder.id, occurrenceAt) === "sent") {
            await actions.markCompleted(job.data.scheduledActionId);
            continue;
          }
          // Another sender may still be waiting for provider acknowledgement.
          // Retry reconciliation without labelling its accepted send a failure.
          throw new ReminderDeliveryPendingError();
        }
        await reminders.markFailed(reminder.id, result.reason);
        await actions.markCancelled(job.data.scheduledActionId, result.reason);
      } catch (error) {
        if (!(error instanceof ReminderDeliveryPendingError)) await reminders.markFailed(job.data.reminderId, error);
        await actions.markFailed(job.data.scheduledActionId, error);
        if (error instanceof ReminderDeliveryPendingError) logger.warn({ reminderId: job.data.reminderId }, "reminder submission awaiting reconciliation");
        else logger.error({ err: error, reminderId: job.data.reminderId }, "reminder delivery failed");
        throw error;
      }
    }
  });
}

class ReminderDeliveryPendingError extends Error {
  constructor() { super("Reminder submission is pending reconciliation"); }
}
