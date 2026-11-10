import { PgBoss } from "pg-boss";
import { DrizzleOutcomeRepository } from "../../db/repositories/outcome-repository";
import { FeedbackTimeoutJob, JOB_NAMES } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";
import { failJob } from "../job-failure";

export async function registerFeedbackTimeoutHandler(boss: PgBoss) {
  await boss.work<FeedbackTimeoutJob>(JOB_NAMES.feedbackTimeout, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      let running = false;
      try {
        running = await actions.markRunning(job.data.scheduledActionId);
        if (!running) continue;
        await new DrizzleOutcomeRepository().recordTimeout(job.data.interventionId, new Date());
        await actions.markCompleted(job.data.scheduledActionId);
      } catch (error) {
        await failJob(error, { jobId: job.id, operation: "Feedback timeout", logMessage: "feedback timeout failed",
          record: running ? retry => actions.markFailed(job.data.scheduledActionId, retry) : undefined });
      }
    }
  });
}
