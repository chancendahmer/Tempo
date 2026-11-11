import { PgBoss } from "pg-boss";
import { withAiInvocationScope } from "../../domain/ai-invocation-scope";
import { AnthropicInterventionComposer } from "../../adapters/llm/intervention-composer";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { getServerEnv } from "../../config/env";
import { proactiveDeliveryEnabled } from "../../config/proactive-delivery";
import { DrizzleContextEngineRepository } from "../../db/repositories/context-engine-repository";
import { DrizzleInterventionRepository } from "../../db/repositories/intervention-repository";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { OutboundDeliveryPendingError, SafeSmsSender } from "../../domain/outbound-messaging";
import { buildInitialAccountabilityPrompt } from "../../domain/accountability";
import { validateInterventionMessage } from "../../domain/intervention-strategy";
import { DeliverInterventionJob, JOB_NAMES } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";
import { failJob } from "../job-failure";

export async function registerDeliverInterventionHandler(boss: PgBoss) {
  await boss.work<DeliverInterventionJob>(JOB_NAMES.deliverIntervention, { localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      const interventions = new DrizzleInterventionRepository();
      let running = false;
      try {
        running = await actions.markRunning(job.data.scheduledActionId);
        if (!running) continue;
        const env = getServerEnv();
        const recovered = await interventions.reconcileDelivery(job.data.interventionId);
        if (recovered?.kind === "submitted") {
          await interventions.startAccountability(job.data.interventionId);
          await actions.completeAndScheduleFeedbackTimeout(
            job.data.scheduledActionId,
            recovered.userId,
            job.data.interventionId,
            new Date(Date.now() + 12 * 3_600_000),
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
        if (recovered?.kind === "pending") throw new OutboundDeliveryPendingError();
        const context = await interventions.getDeliveryContext(job.data.interventionId);
        if (!context) {
          await actions.markCompleted(job.data.scheduledActionId);
          continue;
        }
        if (context.staleDraft) {
          await interventions.markCancelled(context.id);
          await actions.markCancelled(job.data.scheduledActionId, "draft_context_changed");
          continue;
        }
        const checked = proactiveDeliveryEnabled(env, context.userId)
          ? await new DrizzleContextEngineRepository().evaluateDelivery(context.userId, context.id, new Date())
          : null;
        if (!checked) {
          await interventions.markCancelled(context.id);
          await actions.markCancelled(job.data.scheduledActionId, "shadow_mode_or_missing_user");
          continue;
        }
        const { signals, evaluation: revalidation } = checked;
        if (revalidation.decision === "blocked" || revalidation.task?.id !== context.taskId) {
          await interventions.markCancelled(context.id);
          await actions.markCancelled(job.data.scheduledActionId, `eligibility_changed:${revalidation.reasonCodes.join(",")}`);
          continue;
        }

        const claim = await interventions.claimDelivery(context.id);
        if (!claim.claimed) {
          await interventions.markCancelled(context.id);
          await actions.markCancelled(job.data.scheduledActionId, claim.reason);
          continue;
        }

        const message = context.messageText ?? await withAiInvocationScope({ accountId: context.userId, executionId: job.data.scheduledActionId, signal: job.signal }, async () => {
          const nudge = await new AnthropicInterventionComposer().compose({
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
          return validateInterventionMessage(buildInitialAccountabilityPrompt(nudge));
        });
        await interventions.markQueued(context.id, message, context.draftVersion, env.ANTHROPIC_MODEL ?? "deterministic-fallback");
        const outbound = new DrizzleOutboundMessageRepository(undefined, (database, userId) =>
          new DrizzleInterventionRepository(database).canSubmitDelivery(context.id, userId, new Date(), context.draftVersion));
        const sent = await new SafeSmsSender(outbound, createMessagingTransport()).send({
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
        if (deliveryStatus === "failed" || deliveryStatus === "unavailable") {
          await actions.markCancelled(job.data.scheduledActionId, deliveryStatus === "failed" ? "provider_delivery_failed" : "intervention_no_longer_active");
          continue;
        }
        await interventions.startAccountability(context.id);
        await actions.completeAndScheduleFeedbackTimeout(
          job.data.scheduledActionId,
          context.userId,
          context.id,
          new Date(Date.now() + 12 * 3_600_000),
        );
      } catch (error) {
        await failJob(error, { jobId: job.id, operation: "Intervention delivery", logMessage: "intervention delivery failed",
          record: running ? async retry => {
            if (!(error instanceof OutboundDeliveryPendingError)) await interventions.markFailed(job.data.interventionId);
            await actions.markFailed(job.data.scheduledActionId, retry);
          } : undefined });
      }
    }
  });
}
