import type { PgBoss } from "pg-boss";
import { suggestTaskPresentations } from "../../adapters/llm/task-presentation";
import { enrichTaskPresentations } from "../../db/repositories/task-presentation-repository";
import { logger } from "../../observability/logger";

export async function registerTaskPresentationHandler(boss: PgBoss) {
  const name = "tempo.task-presentation";
  await boss.createQueue(name, { policy: "singleton", retryLimit: 0, expireInSeconds: 45, deleteAfterSeconds: 86400 });
  await boss.work(name, { localConcurrency: 1 }, async () => {
    const result = await enrichTaskPresentations(suggestTaskPresentations);
    if (result.saved) logger.info(result, "task display suggestions saved");
  });
  await boss.schedule(name, "* * * * *", {}, { singletonKey: "task-presentation" });
}
