import { DrizzleItemReviewRepository } from "../../db/repositories/item-review-repository";
import { PgBoss } from "pg-boss";
import { AnthropicTaskIntentParser } from "../../adapters/llm/task-intent-parser";
import { createMessagingTransport } from "../../adapters/sms/messaging-provider";
import { getServerEnv } from "../../config/env";
import { DrizzleConversationRepository } from "../../db/repositories/conversation-repository";
import { DrizzleOutboundMessageRepository } from "../../db/repositories/outbound-message-repository";
import { DrizzleTaskRepository } from "../../db/repositories/task-repository";
import { DrizzleGoalRepository } from "../../db/repositories/goal-repository";
import { DrizzleSchedulingRepository } from "../../db/repositories/scheduling-repository";
import { DrizzleOutcomeRepository } from "../../db/repositories/outcome-repository";
import { DrizzleMemoryRepository } from "../../db/repositories/memory-repository";
import { DrizzleConversationHistoryRepository } from "../../db/repositories/conversation-history-repository";
import { DrizzleReminderRepository } from "../../db/repositories/reminder-repository";
import { ConversationOrchestrator } from "../../domain/conversation-orchestrator";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { OutcomeTracker } from "../../domain/outcome-tracker";
import { MemoryService } from "../../domain/memory-service";
import { createSecureActionLinks } from "../../security/action-links";
import { logger } from "../../observability/logger";
import { JOB_NAMES, ProcessInboundJob } from "../names";
import { ScheduledActionRepository } from "../scheduled-action-repository";
import { CalendarAssistantIntegrations } from "../../adapters/calendar/calendar-assistant";
import { isWebMessage, WebReplySender } from "../../db/repositories/web-reply-repository";
import { LifeAssistant } from "../../db/repositories/life-assistant";
import { InboundOwnershipLostError } from "../../domain/inbound-execution";

export async function registerProcessInboundHandler(boss: PgBoss) {
  await boss.work<ProcessInboundJob>(JOB_NAMES.processInbound, { localConcurrency: 4 }, async (jobs) => {
    for (const job of jobs) {
      const actions = new ScheduledActionRepository();
      if (!(await actions.markRunning(job.data.scheduledActionId))) continue;

      try {
        const env = getServerEnv();
        const orchestrator = new ConversationOrchestrator(
          new DrizzleConversationRepository(),
          new DrizzleTaskRepository(),
          new DrizzleGoalRepository(),
          new DrizzleSchedulingRepository(),
          new AnthropicTaskIntentParser(),
          await isWebMessage(job.data.messageId) ? new WebReplySender(job.data.messageId) : new SafeSmsSender(new DrizzleOutboundMessageRepository(), createMessagingTransport()),
          undefined,
          new OutcomeTracker(new DrizzleOutcomeRepository()),
          new MemoryService(new DrizzleMemoryRepository()),
          env.FIELD_ENCRYPTION_KEY ? createSecureActionLinks(env.APP_BASE_URL, env.FIELD_ENCRYPTION_KEY) : undefined,
          new DrizzleConversationHistoryRepository(),
          new DrizzleReminderRepository(),
          new CalendarAssistantIntegrations(),
          new LifeAssistant(),
          new DrizzleItemReviewRepository(),
        );
        await orchestrator.process(job.data.messageId, job.signal);
        await actions.markCompleted(job.data.scheduledActionId);
      } catch (error) {
        if (!job.signal?.aborted && !(error instanceof InboundOwnershipLostError)) await actions.markFailed(job.data.scheduledActionId, error);
        logger.error({ err: error, jobId: job.id }, "inbound conversation job failed");
        throw error;
      }
    }
  });
}
