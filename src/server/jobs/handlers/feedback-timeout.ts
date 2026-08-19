import { PgBoss } from "pg-boss";
import { DrizzleOutcomeRepository } from "../../db/repositories/outcome-repository";
import { logger } from "../../observability/logger";
import { FeedbackTimeoutJob, JOB_NAMES } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";

export async function registerFeedbackTimeoutHandler(boss: PgBoss) {
  await boss.work<FeedbackTimeoutJob>(JOB_NAMES.feedbackTimeout, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      if (!(await actions.markRunning(job.data.scheduledActionId))) continue;
      try {
        await new DrizzleOutcomeRepository().recordTimeout(job.data.interventionId, new Date());
        await actions.markCompleted(job.data.scheduledActionId);
      } catch (error) {
        await actions.markFailed(job.data.scheduledActionId, error);
        logger.error({ err: error, interventionId: job.data.interventionId }, "feedback timeout failed");
        throw error;
      }
    }
  });
}
