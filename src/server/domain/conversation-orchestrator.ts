import type { SendSafeSmsInput } from "./outbound-messaging";
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
import type { TaskIntentParser } from "../adapters/llm/task-intent-parser";
import { isConversationOnlyMessage, isLifeWorkspaceRequest, needsConversationalRouting } from "./conversation-routing";
import { assistantProviderFailureReply } from "./assistant-provider-failure";
import { OutcomeTracker } from "./outcome-tracker";
import { MemoryCommand, MemoryService } from "./memory-service";
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
import { isExplicitReminderRequest, ReminderCommand } from "./reminder-commands";
import { ReminderRepository, executeReminderCommand, requestedReminderTime } from "./reminder-service";
import { AssistantCommand, AssistantIntegrations } from "./assistant-commands";
import { buildRundown, parseRundownRequest, isRundownQuestion } from "./rundown";
import { connectionStatusReply } from "./connection-status-reply";
import { normalizeTaskDeadline } from "./task-deadline";

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
  | { entity: "calendar_confirmation"; token: string; summary: string }
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
  return command.type.endsWith("_reminder") || command.type.endsWith("_reminders");
}

function isMemoryCommand(command: CoachingCommand): command is MemoryCommand {
  return command.type === "remember_memory";
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
    private readonly sms: { send(input: SendSafeSmsInput): Promise<unknown> },
    private readonly now: () => Date = () => new Date(),
    private readonly outcomes?: OutcomeTracker,
    private readonly memories?: MemoryService,
    private readonly secureLinks?: SecureActionLinks,
    private readonly history?: ConversationHistoryRepository,
    private readonly reminders?: ReminderRepository,
    private readonly integrations?: AssistantIntegrations,
    private readonly life?: { execute(userId: string, sourceMessageId: string, command: Extract<AssistantCommand, { type: "food_search" | "life_list" | "life_save" | "life_remove" | "grocery_add" }>): Promise<string> },
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
          replyToMessageId: context.messageId,
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

    let pending = await this.conversations.getPendingAction(context.userId);
    if (pending && pending.createdByMessageId !== context.messageId) {
      if (/^(?:cancel|never mind|nevermind|nope|no)[.!\s]*$/i.test(context.body.trim())) {
        await this.conversations.clearPendingAction(context.userId);
        return "Okay—I dropped that pending change.";
      }
      if (isConversationOnlyMessage(context.body) || isExplicitReminderRequest(context.body)
        || ((pending.entity === "calendar_confirmation" || pending.entity === "reschedule_confirmation")
          && !/^(?:yes|yeah|yep|confirm|sounds good|do it)[.!\s]*$/i.test(context.body.trim()))
        || /^(?:what|why|how|who|can you|could you|help me|tell me|i want|i need|i (?:really )?(?:like|love|enjoy)|remember|forget)\b/i.test(context.body.trim())) {
        await this.conversations.clearPendingAction(context.userId);
        pending = null;
      }
    }
    if (pending && pending.expiresAt <= now) {
      await this.conversations.clearPendingAction(context.userId);
    } else if (pending && pending.createdByMessageId !== context.messageId) {
      if (pending.entity === "calendar_confirmation") {
        if (/^yes[.!\s]*$/i.test(context.body.trim()) && this.integrations) {
          try {
            const result = await this.integrations.confirmCalendarChange(context.userId, pending.token, now);
            await this.conversations.clearPendingAction(context.userId);
            return result;
          } catch {
            await this.conversations.clearPendingAction(context.userId);
            return "I couldn’t verify that calendar change. Please check Google Calendar before requesting it again.";
          }
        }
        return "That calendar change is waiting for confirmation. Reply YES to apply it or NO to cancel.";
      }
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

    // OAuth may finish before conversational preferences. Check persisted account
    // state rather than interpreting a user's claim or a model-generated status.
    const calendarAlreadyConnected = (context.onboardingState === "coaching_style" || context.onboardingState === "calendar")
      && await this.integrations?.hasConnectedCalendar?.(context.userId) === true;
    if (context.onboardingState === "calendar" && calendarAlreadyConnected) {
      await this.conversations.applyOnboarding({ userId: context.userId, nextState: "complete" });
    }
    const onboarding = handleOnboardingMessage(calendarAlreadyConnected && context.onboardingState === "calendar" ? "complete" : context.onboardingState, context.body);
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
        nextState: onboarding.nextState === "calendar" && calendarAlreadyConnected ? "complete" : onboarding.nextState,
        updates: onboarding.updates,
      });
      if (onboarding.nextState === "calendar" && calendarAlreadyConnected) {
        return "Your coaching preference is saved. Google Calendar is already connected, and setup is complete. Ask me about your plans or tell me what you’d like to add. Text STOP to opt out.";
      }
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

    const rundown = parseRundownRequest(context.body, now, context.timezone);
    if (rundown) return buildRundown({ tasks: this.tasks, goals: this.goals, reminders: this.reminders, integrations: this.integrations }, { ...context, now }, rundown);
    const lifeRequest = isLifeWorkspaceRequest(context.body);
    const memoryReply = lifeRequest ? null : await this.memories?.tryHandleCorrection({
      userId: context.userId,
      messageId: context.messageId,
      body: context.body,
      now,
    });
    if (memoryReply) return memoryReply;

    // Broad task heuristics ("move", "cancel", "completed") must not consume
    // requests for a different entity before the assistant can resolve them.
    const otherEntity = lifeRequest || isExplicitReminderRequest(context.body) || /\b(reminders?|calendar|appointments?|events?|breakfast|lunch|dinner|snack)\b/i.test(context.body);
    const heuristicCommand = isRundownQuestion(context.body) || needsConversationalRouting(context.body) ? null : parseGoalCommandHeuristically(context.body)
      ?? (otherEntity ? null : parseRescheduleHeuristically(context.body)
        ?? parseTaskCommandHeuristically(context.body, now));
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
          this.memories?.retrieveRelevant(context.userId, now, 12) ?? Promise.resolve([]),
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
          execute: (command) => this.executeCommand(context, now, command),
        })).catch((error: unknown) => ({ kind: "conversation" as const, reply: assistantProviderFailureReply(error) }));

    if (intent.kind === "conversation") return intent.reply;
    return this.executeCommand(context, now, intent.command);
  }

  private async executeCommand(context: InboundConversationContext, now: Date, command: CoachingCommand): Promise<string> {
    if (command.type === "get_rundown") return buildRundown({ tasks: this.tasks, goals: this.goals, reminders: this.reminders, integrations: this.integrations }, { ...context, now }, command);
    if (command.type === "grocery_add" || command.type === "food_search" || command.type === "life_list" || command.type === "life_save" || command.type === "life_remove") {
      return this.life?.execute(context.userId, context.messageId, command) ?? "Your life workspace is not configured in this environment.";
    }
    if (command.type === "recall_memories") {
      const memories = await this.memories?.retrieveRelevant(context.userId, now, 20) ?? [];
      if (command.query) {
        const terms = command.query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
        const facts = memories.filter(memory => terms.length && terms.every(term => memory.content.toLowerCase().includes(term))).map(({ content }) => content);
        const rawNotes = await this.life?.execute(context.userId, context.messageId, { type: "life_list", kind: "note", query: command.query });
        let noteSearch: unknown = { items: [], notice: "Note search is unavailable; do not claim no note exists." };
        if (rawNotes) { try { noteSearch = JSON.parse(rawNotes); } catch { /* Preserve the explicit unavailable notice. */ } }
        return JSON.stringify({ facts, noteSearch, factSearchNotice: "Search covers up to 20 retrieved facts; no match does not prove the information was never saved." });
      }
      return memories.length ? JSON.stringify(memories.map(({ content }) => content)) : "No saved memory facts found. Thought inbox notes have not been searched; use recall_memories with specific query keywords before answering a personal recall question.";
    }
    if (command.type === "forget_memory") {
      return await this.memories?.tryHandleCorrection({ userId: context.userId, messageId: context.messageId, body: `forget ${command.query}`, now }) ?? "Memory is temporarily unavailable.";
    }
    if (command.type === "connection_status") return connectionStatusReply(await this.integrations?.status(context.userId) ?? "Account connections are not configured. Tasks, reminders, and memory are available.");
    if (command.type === "set_checkins") return this.integrations?.setCheckins(context.userId, command.enabled, command.dailyCap) ?? "Check-in settings are temporarily unavailable.";
    if (command.type === "calendar_agenda" || command.type === "calendar_change") {
      if (!this.integrations) return "Calendar tools are not configured yet. You can still plan a schedule with me.";
      try {
        if (command.type === "calendar_agenda") return await this.integrations.agenda(context.userId, command.start, command.end);
        const proposal = await this.integrations.proposeCalendarChange(context.userId, context.messageId, command.change, context.timezone, now);
        await this.conversations.savePendingAction(context.userId, { entity: "calendar_confirmation", ...proposal, createdByMessageId: context.messageId, expiresAt: new Date(now.getTime() + 15 * 60_000) });
        return proposal.summary;
      } catch {
        return "I couldn’t access or validate that calendar request. Reconnect Google Calendar on the Extensions page and use a specific personal event, date, and time. Shared, all-day, and recurring event edits aren’t supported in this demo.";
      }
    }
    // Narrow before the existing task/goal/reminder handlers.
    const intent = { command };
    if (isMemoryCommand(intent.command)) {
      if (!this.memories) return "Memory is temporarily unavailable.";
      return this.memories.executeCommand({
        userId: context.userId,
        messageId: context.messageId,
        command: intent.command,
        now,
      });
    }
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
      const reminderCommand = intent.command.type === "create_reminder" || intent.command.type === "reschedule_reminder"
        ? { ...intent.command, remindAt: requestedReminderTime(context.body, now, context.timezone) ?? intent.command.remindAt }
        : intent.command;
      return executeReminderCommand(this.reminders, reminderCommand, {
        userId: context.userId,
        sourceMessageId: context.messageId,
        timezone: context.timezone,
        now,
        forModel: command.type === "list_reminders",
      });
    }
    const result = await executeTaskCommand(this.tasks, normalizeTaskDeadline(intent.command, context.body, now, context.timezone), {
      userId: context.userId,
      sourceMessageId: context.messageId,
      timezone: context.timezone,
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
