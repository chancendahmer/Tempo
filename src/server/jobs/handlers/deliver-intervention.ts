import { PgBoss } from "pg-boss";
import { AnthropicInterventionComposer } from "../../adapters/llm/intervention-composer";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { getServerEnv } from "../../config/env";
import { DrizzleContextEngineRepository } from "../../db/repositories/context-engine-repository";
import { DrizzleInterventionRepository } from "../../db/repositories/intervention-repository";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { evaluateContext } from "../../domain/context-engine";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { logger } from "../../observability/logger";
import { DeliverInterventionJob, JOB_NAMES } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";

export async function registerDeliverInterventionHandler(boss: PgBoss) {
  await boss.work<DeliverInterventionJob>(JOB_NAMES.deliverIntervention, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      const interventions = new DrizzleInterventionRepository();
      if (!(await actions.markRunning(job.data.scheduledActionId))) continue;
      try {
        const env = getServerEnv();
        const recovered = await interventions.reconcileDelivery(job.data.interventionId);
        if (recovered?.kind === "submitted") {
          const delayMinutes = recovered.style === "body_doubling" ? 15 : 45;
          await actions.completeAndScheduleFeedback(
            job.data.scheduledActionId,
            recovered.userId,
            job.data.interventionId,
            new Date(Date.now() + delayMinutes * 60_000),
          );
          continue;
        }
        if (recovered?.kind === "complete") {
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        if (recovered?.kind === "terminal") {
          await actions.markCancelled(job.data.scheduledActionId, `intervention_${recovered.status}`);
          continue;
        }
        const context = await interventions.getDeliveryContext(job.data.interventionId);
        if (!context) {
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        const contextRepository = new DrizzleContextEngineRepository();
        const [policy, signals] = await Promise.all([
          contextRepository.getActivePolicy(),
          contextRepository.loadSignals(context.userId, new Date()),
        ]);
        if (!signals || env.INTERVENTION_SHADOW_MODE || !env.AUTONOMOUS_SENDING_ENABLED) {
          await interventions.markCancelled(context.id);
          await actions.markCancelled(job.data.scheduledActionId, "shadow_mode_or_missing_user");
          continue;
        }
        const revalidation = evaluateContext({ signals, policy, now: new Date(), shadowMode: false });
        if (revalidation.decision === "blocked" || revalidation.task?.id !== context.taskId) {
          await interventions.markCancelled(context.id);
          await actions.markCancelled(job.data.scheduledActionId, `eligibility_changed:${revalidation.reasonCodes.join(",")}`);
          continue;
        }

        const message = context.messageText ?? await new AnthropicInterventionComposer().compose({
            style: context.style,
            taskTitle: context.taskTitle,
            dueAt: context.dueAt,
            estimatedMinutes: context.estimatedMinutes,
            freeMinutes: signals.freeMinutes,
            nextFreeAt: signals.nextFreeAt,
            timezone: signals.timezone,
            tone: context.coachingTone,
            memories: context.memories,
          });
        await interventions.markQueued(context.id, message, "intervention-v1", env.ANTHROPIC_MODEL ?? "deterministic-fallback");
        const sent = await new SafeSmsSender(new DrizzleOutboundMessageRepository(), createMessagingTransport()).send({
          userId: context.userId,
          body: message,
          kind: "coach",
          idempotencyKey: `intervention-sms:${context.id}`,
          relatedInterventionId: context.id,
        });
        if (!sent.sent) {
          await interventions.markCancelled(context.id);
          await actions.markCancelled(job.data.scheduledActionId, sent.reason);
          continue;
        }
        const deliveryStatus = await interventions.markSent(context.id, sent.providerMessageSid, new Date(), sent.provider);
        if (deliveryStatus === "failed") {
          await actions.markCancelled(job.data.scheduledActionId, "provider_delivery_failed");
          continue;
        }
        const delayMinutes = context.style === "body_doubling" ? 15 : 45;
        await actions.completeAndScheduleFeedback(
          job.data.scheduledActionId,
          context.userId,
          context.id,
          new Date(Date.now() + delayMinutes * 60_000),
        );
      } catch (error) {
        await interventions.markFailed(job.data.interventionId);
        await actions.markFailed(job.data.scheduledActionId, error);
        logger.error({ err: error, interventionId: job.data.interventionId }, "intervention delivery failed");
        throw error;
      }
    }
  });
}
