import { PgBoss } from "pg-boss";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { DrizzleReminderRepository } from "../../db/repositories/reminder-repository";
import { DrizzleTaskRepository } from "../../db/repositories/task-repository";
import { DrizzleGoalRepository } from "../../db/repositories/goal-repository";
import { LifeAssistant } from "../../db/repositories/life-assistant";
import { CalendarAssistantIntegrations } from "../../adapters/calendar/calendar-assistant";
import { reminderDeliveryBody } from "../../domain/reminder-delivery-body";
import { SafeSmsSender, OutboundDeliveryPendingError } from "../../domain/outbound-messaging";
import { DeliverReminderJob, JOB_NAMES } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";
import { failJob } from "../job-failure";

export async function registerDeliverReminderHandler(boss: PgBoss) {
  await boss.work<DeliverReminderJob>(JOB_NAMES.deliverReminder, { localConcurrency: 4 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      const reminders = new DrizzleReminderRepository();
      let running = false;
      try {
        running = await actions.markRunning(job.data.scheduledActionId);
        if (!running) continue;
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
        const outbound = new DrizzleOutboundMessageRepository();
        const idempotencyKey = reminders.getOccurrenceIdempotencyKey(reminder.id, occurrenceAt);
        // Once reserved, retries reuse the canonical body even if the plan changes.
        const body = await outbound.reservedBody(reminder.userId, idempotencyKey) ?? await reminderDeliveryBody(reminder, {
          tasks: new DrizzleTaskRepository(), goals: new DrizzleGoalRepository(), reminders,
          integrations: new CalendarAssistantIntegrations(),
          workspace: new LifeAssistant(),
        }, new Date());
        const result = await new SafeSmsSender(outbound, createMessagingTransport()).send({
          userId: reminder.userId,
          body,
          signal: job.signal,
          kind: "coach",
          idempotencyKey,
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
        const reconciliation = error instanceof ReminderDeliveryPendingError;
        const pending = reconciliation || error instanceof OutboundDeliveryPendingError;
        await failJob(error, { jobId: job.id, operation: "Reminder delivery", level: reconciliation ? "warn" : "error",
          logMessage: reconciliation ? "reminder submission awaiting reconciliation" : "reminder delivery failed",
          reconciliationError: reconciliation ? new ReminderDeliveryPendingError() : undefined,
          record: running ? async retry => {
            if (!pending) await reminders.markFailed(job.data.reminderId, retry);
            await actions.markFailed(job.data.scheduledActionId, retry);
          } : undefined });
      }
    }
  });
}

class ReminderDeliveryPendingError extends Error {
  constructor() { super("Reminder submission is pending reconciliation"); }
}
