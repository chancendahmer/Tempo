import { PgBoss } from "pg-boss";
import { getServerEnv } from "../../config/env";
import { DrizzleContextEngineRepository } from "../../db/repositories/context-engine-repository";
import { DrizzleInterventionRepository } from "../../db/repositories/intervention-repository";
import { evaluateUserContext } from "../../domain/context-evaluation-service";
import { logger } from "../../observability/logger";
import { EvaluateContextJob, JOB_NAMES } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";

const EVALUATION_INTERVAL_MS = 15 * 60_000;

export async function registerEvaluateContextHandler(boss: PgBoss) {
  await boss.work<EvaluateContextJob>(JOB_NAMES.evaluateContext, { localConcurrency: 4 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      if (!(await actions.markRunning(job.data.scheduledActionId))) continue;
      try {
        const result = await evaluateUserContext({
          userId: job.data.userId,
          repository: new DrizzleContextEngineRepository(),
          shadowMode: getServerEnv().INTERVENTION_SHADOW_MODE || !getServerEnv().AUTONOMOUS_SENDING_ENABLED,
          planner: new DrizzleInterventionRepository(),
        });
        if (result.evaluated) {
          await actions.completeAndScheduleContextEvaluation(job.data.scheduledActionId, job.data.userId, new Date(Date.now() + EVALUATION_INTERVAL_MS));
          logger.debug({ userId: job.data.userId, decision: result.evaluation.decision, score: result.evaluation.score }, "context evaluated");
        } else await actions.markCompleted(job.data.scheduledActionId);
      } catch (error) {
        await actions.markFailed(job.data.scheduledActionId, error);
        await actions.scheduleRecurringRecovery({
          failedActionId: job.data.scheduledActionId,
          userId: job.data.userId,
          kind: "evaluate_context",
          runAt: new Date(Date.now() + 60 * 60_000),
        });
        logger.error({ err: error, userId: job.data.userId }, "context evaluation failed");
        throw error;
      }
    }
  });
}
