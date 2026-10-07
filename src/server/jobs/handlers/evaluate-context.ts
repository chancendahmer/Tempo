import { inOwnedExecution, ownedService } from "../../domain/inbound-execution";
import { DrizzleItemReviewRepository } from "../../db/repositories/item-review-repository";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { deliverItemReview } from "../../domain/item-review-delivery";
import { PgBoss } from "pg-boss";
import { getServerEnv } from "../../config/env";
import { cleanupDeliveryEnabled, proactiveDeliveryEnabled } from "../../config/proactive-delivery";
import { DrizzleContextEngineRepository } from "../../db/repositories/context-engine-repository";
import { DrizzleInterventionRepository } from "../../db/repositories/intervention-repository";
import { AnthropicInterventionDecisionReviewer } from "../../adapters/llm/intervention-decision-reviewer";
import { evaluateUserContext } from "../../domain/context-evaluation-service";
import { logger } from "../../observability/logger";
import { EvaluateContextJob, JOB_NAMES } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";

const EVALUATION_INTERVAL_MS = 5 * 60_000;

export async function registerEvaluateContextHandler(boss: PgBoss) {
  await boss.work<EvaluateContextJob>(JOB_NAMES.evaluateContext, { localConcurrency: 4 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      const ownership = await actions.claimRecurring(job.data.scheduledActionId, job.signal, job.expireInSeconds * 1000);
      if (!ownership) continue;
      try {
        const env = getServerEnv();
        const shadowMode = !proactiveDeliveryEnabled(env, job.data.userId);
        if (cleanupDeliveryEnabled(env, job.data.userId) && await deliverItemReview({ userId: job.data.userId, enabled: true, repository: new DrizzleItemReviewRepository(), sender: new SafeSmsSender(new DrizzleOutboundMessageRepository(), createMessagingTransport()), runOwned: ownership.run, signal: job.signal })) {
          await actions.completeAndScheduleContextEvaluation(job.data.scheduledActionId, job.data.userId, new Date(Date.now() + EVALUATION_INTERVAL_MS));
          continue;
        }
        const result = await inOwnedExecution(ownership, () => evaluateUserContext({
          userId: job.data.userId,
          repository: ownedService(new DrizzleContextEngineRepository()),
          shadowMode,
          planner: ownedService(new DrizzleInterventionRepository()),
          reviewer: !shadowMode && env.HYBRID_AI_REVIEW_ENABLED ? new AnthropicInterventionDecisionReviewer() : undefined,
        }));
        if (result.evaluated) {
          await actions.completeAndScheduleContextEvaluation(job.data.scheduledActionId, job.data.userId, new Date(Date.now() + EVALUATION_INTERVAL_MS));
          logger.debug({ userId: job.data.userId, decision: result.evaluation.decision, score: result.evaluation.score }, "context evaluated");
        } else await actions.markCompleted(job.data.scheduledActionId);
      } catch (error) {
        if (job.signal.aborted) throw error;
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
