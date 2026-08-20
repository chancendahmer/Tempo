import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss } from "pg-boss";
import { getDatabase, TempoDatabase } from "../db/client";
import { scheduledActions } from "../db/schema";
import { logger } from "../observability/logger";
import { AccountabilityFollowupJob, DeliverInterventionJob, DeliverReminderJob, EvaluateContextJob, FeedbackFollowupJob, FeedbackTimeoutJob, JOB_NAMES, ProcessInboundJob, SendComplianceJob, SendWelcomeJob, SyncCalendarJob } from "./names";

type DispatchableAction = {
  id: string;
  userId: string;
  idempotencyKey: string;
  interventionId: string | null;
  reminderId: string | null;
  kind: "send_welcome" | "send_compliance" | "process_inbound_message" | "deliver_reminder" | "sync_calendar" | "evaluate_context" | "deliver_intervention" | "accountability_followup" | "feedback_followup" | "feedback_timeout";
  payload: Record<string, unknown>;
};

export async function dispatchDueActions(
  boss: PgBoss,
  limit = 25,
  database: TempoDatabase = getDatabase(),
): Promise<number> {
  return database.transaction(async (transaction) => {
    const result = await transaction.execute<DispatchableAction>(sql`
      select id, user_id as "userId", intervention_id as "interventionId", reminder_id as "reminderId", idempotency_key as "idempotencyKey", kind, payload
      from ${scheduledActions}
      where status = 'scheduled'
        and kind in ('send_welcome', 'send_compliance', 'process_inbound_message', 'deliver_reminder', 'sync_calendar', 'evaluate_context', 'deliver_intervention', 'accountability_followup', 'feedback_followup', 'feedback_timeout')
        and run_at <= now()
      order by run_at asc
      for update skip locked
      limit ${limit}
    `);

    for (const action of result.rows) {
      const queueName = action.kind === "send_welcome"
        ? JOB_NAMES.sendWelcome
        : action.kind === "send_compliance"
          ? JOB_NAMES.sendCompliance
        : action.kind === "process_inbound_message"
          ? JOB_NAMES.processInbound
          : action.kind === "deliver_reminder"
            ? JOB_NAMES.deliverReminder
          : action.kind === "sync_calendar"
            ? JOB_NAMES.syncCalendar
            : action.kind === "evaluate_context"
              ? JOB_NAMES.evaluateContext
              : action.kind === "deliver_intervention"
                ? JOB_NAMES.deliverIntervention
                : action.kind === "accountability_followup"
                  ? JOB_NAMES.accountabilityFollowup
                : action.kind === "feedback_followup"
                  ? JOB_NAMES.feedbackFollowup
                  : JOB_NAMES.feedbackTimeout;
      const data: SendWelcomeJob | SendComplianceJob | ProcessInboundJob | DeliverReminderJob | SyncCalendarJob | EvaluateContextJob | DeliverInterventionJob | AccountabilityFollowupJob | FeedbackFollowupJob | FeedbackTimeoutJob =
        action.kind === "send_welcome" || action.kind === "send_compliance"
          ? {
              scheduledActionId: action.id,
              userId: action.userId,
              idempotencyKey: action.idempotencyKey,
            }
          : action.kind === "process_inbound_message" ? {
              scheduledActionId: action.id,
              userId: action.userId,
              messageId: String(action.payload.messageId ?? ""),
            } : action.kind === "deliver_reminder" ? {
              scheduledActionId: action.id,
              userId: action.userId,
              reminderId: String(action.payload.reminderId ?? action.reminderId ?? ""),
            } : action.kind === "deliver_intervention" || action.kind === "accountability_followup" || action.kind === "feedback_followup" || action.kind === "feedback_timeout"
              ? { scheduledActionId: action.id, userId: action.userId, interventionId: String(action.payload.interventionId ?? action.interventionId ?? "") }
              : { scheduledActionId: action.id, userId: action.userId };
      if (action.kind === "process_inbound_message" && !(data as ProcessInboundJob).messageId) {
        throw new Error(`Scheduled inbound action ${action.id} has no messageId`);
      }
      if (action.kind === "deliver_reminder" && !(data as DeliverReminderJob).reminderId) {
        throw new Error(`Scheduled reminder action ${action.id} has no reminderId`);
      }
      if ((action.kind === "deliver_intervention" || action.kind === "accountability_followup" || action.kind === "feedback_followup" || action.kind === "feedback_timeout") && !(data as DeliverInterventionJob).interventionId) {
        throw new Error(`Scheduled intervention action ${action.id} has no interventionId`);
      }
      const jobId = await boss.send(queueName, data, {
        id: action.id,
        singletonKey: action.userId,
        db: fromDrizzle(transaction, sql),
      });

      await transaction
        .update(scheduledActions)
        .set({
          status: "running",
          queueJobId: jobId ?? action.id,
          attempts: sql`${scheduledActions.attempts} + 1`,
          updatedAt: new Date(),
        })
        .where(sql`${scheduledActions.id} = ${action.id}`);
    }

    return result.rows.length;
  });
}

export function startActionDispatcher(boss: PgBoss, intervalMs: number): () => void {
  let dispatching = false;

  const tick = async () => {
    if (dispatching) return;
    dispatching = true;
    try {
      const count = await dispatchDueActions(boss);
      if (count > 0) logger.info({ count }, "scheduled actions dispatched");
    } catch (error) {
      logger.error({ err: error }, "scheduled action dispatch failed");
    } finally {
      dispatching = false;
    }
  };

  void tick();
  const interval = setInterval(() => void tick(), intervalMs);
  return () => clearInterval(interval);
}
