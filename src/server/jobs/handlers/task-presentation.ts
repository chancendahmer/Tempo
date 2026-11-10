import type { PgBoss } from "pg-boss";
import { suggestTaskPresentations } from "../../adapters/llm/task-presentation";
import { enrichTaskPresentations } from "../../db/repositories/task-presentation-repository";
import { logger } from "../../observability/logger";
import { failJob } from "../job-failure";

export async function registerTaskPresentationHandler(boss: PgBoss) {
  const name = "tempo.task-presentation";
  await boss.createQueue(name, { policy: "singleton", retryLimit: 0, expireInSeconds: 45, deleteAfterSeconds: 86400 });
  await boss.work(name, { localConcurrency: 1 }, async jobs => {
    for (const job of jobs) {
      try {
        const result = await enrichTaskPresentations(suggestTaskPresentations);
        if (result.saved) logger.info(result, "task display suggestions saved");
      } catch (error) {
        await failJob(error, { jobId: job.id, operation: "Task presentation" });
      }
    }
  });
  await boss.schedule(name, "* * * * *", {}, { singletonKey: "task-presentation" });
}
