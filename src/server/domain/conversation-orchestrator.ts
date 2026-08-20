import { SafeSmsSender } from "./outbound-messaging";
import { handleOnboardingMessage } from "./onboarding";
import { parseTaskCommandHeuristically, resolveTaskReference } from "./task-commands";
import {
  PendingTaskAction,
  TaskRepository,
  executeResolvedTaskCommand,
  executeTaskCommand,
  replyForTaskAction,
  resolvePendingTaskChoice,
} from "./task-service";
import { TaskIntentParser } from "../adapters/llm/task-intent-parser";
import { OutcomeTracker } from "./outcome-tracker";
import { MemoryService } from "./memory-service";
import { SecureActionLinks } from "../security/action-links";
import { GoalCommand, parseGoalCommandHeuristically } from "./goal-commands";
import {
  GoalRepository,
  PendingGoalAction,
  executeGoalCommand,
  executeResolvedGoalCommand,
  replyForGoalAction,
  resolvePendingGoalChoice,
} from "./goal-service";
import { CoachingCommand } from "../adapters/llm/task-intent-parser";
import {
  RescheduleCommand,
  RescheduleProposal,
  SchedulingRepository,
  confirmTaskReschedule,
  formatProposedTime,
  parseRescheduleHeuristically,
  proposeResolvedTaskReschedule,
  proposeTaskReschedule,
} from "./reschedule-service";
import { ConversationHistoryRepository } from "./conversation-history";
import { ReminderCommand } from "./reminder-commands";
import { ReminderRepository, executeReminderCommand } from "./reminder-service";

export type InboundConversationContext = {
  messageId: string;
  conversationId: string;
  userId: string;
  body: string;
  timezone: string;
  profileInstructions: string | null;
  onboardingState:
    | "awaiting_consent"
    | "introduction"
    | "timezone"
    | "quiet_hours"
    | "coaching_style"
    | "first_task"
    | "calendar"
    | "complete";
};

export type StoredPendingAction = (
  | ({ entity: "task" } & PendingTaskAction)
  | ({ entity: "goal" } & PendingGoalAction)
  | { entity: "reschedule_choice"; command: RescheduleCommand; candidates: Array<{ id: string; title: string }> }
  | { entity: "reschedule_confirmation"; taskId: string; taskTitle: string; proposedAt: Date }
) & {
  createdByMessageId: string;
  expiresAt: Date;
};

function isGoalCommand(command: CoachingCommand): command is GoalCommand {
  return command.type.endsWith("_goal") || command.type === "list_goals";
}

function isRescheduleCommand(command: CoachingCommand): command is RescheduleCommand {
  return command.type === "reschedule_task";
}

function isReminderCommand(command: CoachingCommand): command is ReminderCommand {
  return command.type.endsWith("_reminder") || command.type === "list_reminders";
}

export interface ConversationRepository {
  claimInbound(messageId: string, now: Date): Promise<InboundConversationContext | null>;
  releaseInbound(messageId: string): Promise<void>;
  markProcessed(userId: string, messageId: string): Promise<void>;
  getPendingAction(userId: string): Promise<StoredPendingAction | null>;
  savePendingAction(userId: string, action: StoredPendingAction): Promise<void>;
  clearPendingAction(userId: string): Promise<void>;
  applyOnboarding(input: {
    userId: string;
    nextState: InboundConversationContext["onboardingState"];
    updates?: {
      timezone?: string;
      quietHoursStart?: string;
      quietHoursEnd?: string;
      coachingTone?: "gentle" | "balanced" | "direct";
    };
  }): Promise<void>;
}

export class ConversationOrchestrator {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly tasks: TaskRepository,
    private readonly goals: GoalRepository,
    private readonly scheduling: SchedulingRepository,
    private readonly intentParser: TaskIntentParser,
    private readonly sms: SafeSmsSender,
    private readonly now: () => Date = () => new Date(),
    private readonly outcomes?: OutcomeTracker,
    private readonly memories?: MemoryService,
    private readonly secureLinks?: SecureActionLinks,
    private readonly history?: ConversationHistoryRepository,
    private readonly reminders?: ReminderRepository,
  ) {}

  async process(messageId: string): Promise<{ processed: boolean }> {
    const now = this.now();
    const context = await this.conversations.claimInbound(messageId, now);
    if (!context) return { processed: false };

    try {
      const reply = await this.decideReply(context, now);
      if (reply) {
        await this.sms.send({
          userId: context.userId,
          body: reply,
          kind: "coach",
          idempotencyKey: `reply:${context.messageId}`,
        });
      }
      await this.conversations.markProcessed(context.userId, context.messageId);
      return { processed: true };
    } catch (error) {
      await this.conversations.releaseInbound(context.messageId);
      throw error;
    }
  }

  private async decideReply(context: InboundConversationContext, now: Date): Promise<string | undefined> {
    if (context.onboardingState === "calendar" || context.onboardingState === "complete") {
      const priorAction = await this.tasks.findActionBySourceMessage(context.messageId);
      if (priorAction) {
        if (priorAction.eventType === "started" || priorAction.eventType === "completed") {
          await this.outcomes?.attributeTaskProgress({
            userId: context.userId,
            taskId: priorAction.task.id,
            messageId: context.messageId,
            event: priorAction.eventType,
            now,
          });
        }
        await this.conversations.clearPendingAction(context.userId);
        return replyForTaskAction(priorAction.eventType, priorAction.task);
      }
      const priorGoalAction = await this.goals.findActionBySourceMessage(context.messageId);
      if (priorGoalAction) {
        await this.conversations.clearPendingAction(context.userId);
        return replyForGoalAction(priorGoalAction.eventType, priorGoalAction.goal);
      }
    }

    const pending = await this.conversations.getPendingAction(context.userId);
    if (pending && pending.expiresAt <= now) {
      await this.conversations.clearPendingAction(context.userId);
    } else if (pending && pending.createdByMessageId !== context.messageId) {
      if (pending.entity === "reschedule_confirmation") {
        if (/^(?:yes|yeah|yep|confirm|sounds good|do it)[.!\s]*$/i.test(context.body.trim())) {
          const task = await confirmTaskReschedule(this.tasks, {
            userId: context.userId,
            taskId: pending.taskId,
            sourceMessageId: context.messageId,
            proposedAt: pending.proposedAt,
          });
          await this.conversations.clearPendingAction(context.userId);
          return `Moved ${task.title} to ${formatProposedTime(pending.proposedAt, context.timezone)}.`;
        }
        if (/^(?:no|nope|cancel|never mind)[.!\s]*$/i.test(context.body.trim())) {
          await this.conversations.clearPendingAction(context.userId);
          return "Okay—I left the task where it was.";
        }
        return "Reply YES to move it, or NO to keep the current plan.";
      }
      if (pending.entity === "reschedule_choice") {
        const resolution = resolveTaskReference(
          pending.candidates.map((task) => ({ ...task, status: "not_started" as const })),
          { taskQuery: context.body.trim() },
        );
        const numbered = Number(context.body.trim());
        const taskId = Number.isInteger(numbered) && numbered >= 1 && numbered <= pending.candidates.length
          ? pending.candidates[numbered - 1].id
          : resolution.kind === "resolved"
            ? resolution.task.id
            : null;
        if (!taskId) return "Reply with the task number or a more specific title.";
        const proposal = await proposeResolvedTaskReschedule(
          this.tasks,
          this.scheduling,
          taskId,
          pending.command.afterToday,
          { userId: context.userId, now },
        );
        return this.handleRescheduleProposal(context, proposal, now);
      }
      if (pending.entity === "task") {
        const choice = resolvePendingTaskChoice(pending, context.body);
        if ("error" in choice) return choice.error;
        const result = await executeResolvedTaskCommand(this.tasks, pending.command, choice.taskId, {
          userId: context.userId,
          sourceMessageId: context.messageId,
          now,
        });
        if (result.kind === "executed" && result.task && (pending.command.type === "start_task" || pending.command.type === "complete_task")) {
          await this.outcomes?.attributeTaskProgress({
            userId: context.userId, taskId: result.task.id, messageId: context.messageId,
            event: pending.command.type === "start_task" ? "started" : "completed", now,
          });
        }
        await this.conversations.clearPendingAction(context.userId);
        return result.reply;
      }
      const choice = resolvePendingGoalChoice(pending, context.body);
      if ("error" in choice) return choice.error;
      const result = await executeResolvedGoalCommand(this.goals, pending.command, choice.goalId, {
        userId: context.userId,
        sourceMessageId: context.messageId,
        now,
      });
      await this.conversations.clearPendingAction(context.userId);
      return result.reply;
    }

    const onboarding = handleOnboardingMessage(context.onboardingState, context.body);
    if (onboarding.handled) {
      if (onboarding.createTaskTitle) {
        await executeTaskCommand(
          this.tasks,
          { type: "create_task", title: onboarding.createTaskTitle },
          { userId: context.userId, sourceMessageId: context.messageId, now },
        );
      }
      await this.conversations.applyOnboarding({
        userId: context.userId,
        nextState: onboarding.nextState,
        updates: onboarding.updates,
      });
      if (onboarding.nextState === "calendar" && this.secureLinks) {
        return `${onboarding.reply}\n${this.secureLinks.calendarConnect(context.userId)}`;
      }
      return onboarding.reply;
    }

    if (/^(connect|reconnect)( my)? (google )?calendar[.!\s]*$/i.test(context.body.trim()) && this.secureLinks) {
      return `Connect Google Calendar securely here: ${this.secureLinks.calendarConnect(context.userId)}`;
    }
    if (/^(resume|come back|text me again|start coaching again)(?:[.!\s]*)$/i.test(context.body.trim())) {
      return "I’m back. I’ll keep watching for a useful moment and you can text “leave me alone” anytime you need space.";
    }
    if (/^disconnect( my)? (google )?calendar[.!\s]*$/i.test(context.body.trim()) && this.secureLinks) {
      return `Use this secure confirmation link to disconnect Calendar: ${this.secureLinks.calendarDisconnect(context.userId)}`;
    }
    if (/^(delete my (tempo )?(account|data)|delete everything)[.!\s]*$/i.test(context.body.trim()) && this.secureLinks) {
      return `This permanently deletes your Tempo data. Confirm only if that’s what you want: ${this.secureLinks.accountDelete(context.userId)}`;
    }

    const memoryReply = await this.memories?.tryHandleCorrection({
      userId: context.userId,
      messageId: context.messageId,
      body: context.body,
      now,
    });
    if (memoryReply) return memoryReply;

    const heuristicCommand = parseRescheduleHeuristically(context.body)
      ?? parseTaskCommandHeuristically(context.body, now)
      ?? parseGoalCommandHeuristically(context.body);
    if (!heuristicCommand) {
      const feedbackReply = await this.outcomes?.tryHandleStandaloneReply({
        userId: context.userId,
        messageId: context.messageId,
        body: context.body,
        now,
      });
      if (feedbackReply) return feedbackReply;
    }
    const intent = heuristicCommand
      ? { kind: "command" as const, command: heuristicCommand }
      : await Promise.all([
          this.tasks.listForResolution(context.userId),
          this.goals.listForResolution(context.userId),
          this.memories?.retrieveRelevant(context.userId, now, 8) ?? Promise.resolve([]),
          this.history?.getRecent({
            conversationId: context.conversationId,
            beforeMessageId: context.messageId,
            limit: 12,
          }) ?? Promise.resolve([]),
        ]).then(([openTasks, openGoals, memories, history]) => this.intentParser.parse({
          message: context.body,
          timezone: context.timezone,
          now,
          openTasks,
          openGoals,
          memories: memories.map((memory) => memory.content),
          customInstructions: context.profileInstructions ?? undefined,
          history,
        }));

    if (intent.kind === "conversation") return intent.reply;
    if (isGoalCommand(intent.command)) {
      const result = await executeGoalCommand(this.goals, intent.command, {
        userId: context.userId,
        sourceMessageId: context.messageId,
        now,
      });
      if (result.kind === "needs_confirmation") {
        await this.conversations.savePendingAction(context.userId, {
          entity: "goal",
          ...result.pending,
          createdByMessageId: context.messageId,
          expiresAt: new Date(now.getTime() + 15 * 60_000),
        });
      }
      return result.reply;
    }
    if (isRescheduleCommand(intent.command)) {
      const proposal = await proposeTaskReschedule(this.tasks, this.scheduling, intent.command, {
        userId: context.userId,
        now,
      });
      return this.handleRescheduleProposal(context, proposal, now, intent.command);
    }
    if (isReminderCommand(intent.command)) {
      if (!this.reminders) return "Reminder scheduling is temporarily unavailable.";
      return executeReminderCommand(this.reminders, intent.command, {
        userId: context.userId,
        sourceMessageId: context.messageId,
        timezone: context.timezone,
        now,
      });
    }
    const result = await executeTaskCommand(this.tasks, intent.command, {
      userId: context.userId,
      sourceMessageId: context.messageId,
      now,
    });
    if (result.kind === "executed" && result.task && (intent.command.type === "start_task" || intent.command.type === "complete_task")) {
      await this.outcomes?.attributeTaskProgress({
        userId: context.userId, taskId: result.task.id, messageId: context.messageId,
        event: intent.command.type === "start_task" ? "started" : "completed", now,
      });
    }
    if (result.kind === "needs_confirmation") {
      await this.conversations.savePendingAction(context.userId, {
        entity: "task",
        ...result.pending,
        createdByMessageId: context.messageId,
        expiresAt: new Date(now.getTime() + 15 * 60_000),
      });
    }
    return result.reply;
  }

  private async handleRescheduleProposal(
    context: InboundConversationContext,
    proposal: RescheduleProposal,
    now: Date,
    command?: RescheduleCommand,
  ): Promise<string> {
    if (proposal.kind === "not_found") {
      return "I couldn’t find that task. Text “list my tasks” to see the current list.";
    }
    if (proposal.kind === "ambiguous") {
      await this.conversations.savePendingAction(context.userId, {
        entity: "reschedule_choice",
        command: command ?? { type: "reschedule_task", afterToday: false },
        candidates: proposal.candidates,
        createdByMessageId: context.messageId,
        expiresAt: new Date(now.getTime() + 15 * 60_000),
      });
      return `Which task should I reschedule?\n${proposal.candidates.map((task, index) => `${index + 1}. ${task.title}`).join("\n")}`;
    }
    if (proposal.kind === "calendar_unavailable") {
      return "I need a fresh Google Calendar connection to suggest a real open time. Text “connect calendar,” or tell me the exact day and time you want.";
    }
    await this.conversations.savePendingAction(context.userId, {
      entity: "reschedule_confirmation",
      taskId: proposal.task.id,
      taskTitle: proposal.task.title,
      proposedAt: proposal.proposedAt,
      createdByMessageId: context.messageId,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
    return `I found ${formatProposedTime(proposal.proposedAt, context.timezone)} for ${proposal.task.title}. Move it there? Reply YES or NO.`;
  }
}
