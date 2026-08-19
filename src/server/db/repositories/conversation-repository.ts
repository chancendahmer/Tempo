import { and, eq, lt, or } from "drizzle-orm";
import { ConversationRepository, StoredPendingAction } from "../../domain/conversation-orchestrator";
import { taskCommandSchema } from "../../domain/task-commands";
import { goalCommandSchema } from "../../domain/goal-commands";
import { rescheduleCommandSchema } from "../../domain/reschedule-service";
import { getDatabase, TempoDatabase } from "../client";
import { conversationMessages, conversationStates, users } from "../schema";

function parsePending(value: Record<string, unknown> | null, expiresAt: Date | null): StoredPendingAction | null {
  if (!value || !expiresAt) return null;
  if (typeof value.createdByMessageId !== "string") return null;
  if (value.entity === "reschedule_confirmation") {
    const proposedAt = typeof value.proposedAt === "string" ? new Date(value.proposedAt) : null;
    if (
      typeof value.taskId !== "string" ||
      typeof value.taskTitle !== "string" ||
      !proposedAt ||
      Number.isNaN(proposedAt.getTime())
    ) return null;
    return {
      entity: "reschedule_confirmation",
      taskId: value.taskId,
      taskTitle: value.taskTitle,
      proposedAt,
      createdByMessageId: value.createdByMessageId,
      expiresAt,
    };
  }
  const candidates = Array.isArray(value.candidates)
    ? value.candidates.filter(
        (candidate): candidate is { id: string; title: string } =>
          typeof candidate === "object" &&
          candidate !== null &&
          typeof (candidate as Record<string, unknown>).id === "string" &&
          typeof (candidate as Record<string, unknown>).title === "string",
      )
    : [];
  if (candidates.length === 0) return null;
  if (value.entity === "reschedule_choice") {
    return {
      entity: "reschedule_choice",
      command: rescheduleCommandSchema.parse(value.command),
      candidates,
      createdByMessageId: value.createdByMessageId,
      expiresAt,
    };
  }
  if (value.entity === "task") {
    const command = taskCommandSchema.parse(value.command);
    if (command.type === "create_task" || command.type === "list_tasks") return null;
    return { entity: "task", command, candidates, createdByMessageId: value.createdByMessageId, expiresAt };
  }
  if (value.entity === "goal") {
    const command = goalCommandSchema.parse(value.command);
    if (command.type === "create_goal" || command.type === "list_goals") return null;
    return { entity: "goal", command, candidates, createdByMessageId: value.createdByMessageId, expiresAt };
  }
  return null;
}

export class DrizzleConversationRepository implements ConversationRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async claimInbound(messageId: string, now: Date) {
    return this.database.transaction(async (transaction) => {
      const staleBefore = new Date(now.getTime() - 5 * 60_000);
      const [claimed] = await transaction
        .update(conversationMessages)
        .set({ status: "processing", processingStartedAt: now, updatedAt: now })
        .where(
          and(
            eq(conversationMessages.id, messageId),
            eq(conversationMessages.direction, "inbound"),
            or(
              eq(conversationMessages.status, "received"),
              and(
                eq(conversationMessages.status, "processing"),
                lt(conversationMessages.processingStartedAt, staleBefore),
              ),
            ),
          ),
        )
        .returning({
          messageId: conversationMessages.id,
          userId: conversationMessages.userId,
          body: conversationMessages.body,
        });
      if (!claimed) return null;

      const [user] = await transaction
        .select({
          timezone: users.timezone,
          onboardingState: users.onboardingState,
        })
        .from(users)
        .where(eq(users.id, claimed.userId))
        .limit(1);
      if (!user) throw new Error("Inbound message user not found");
      return { ...claimed, ...user };
    });
  }

  async releaseInbound(messageId: string) {
    await this.database
      .update(conversationMessages)
      .set({ status: "received", processingStartedAt: null, updatedAt: new Date() })
      .where(eq(conversationMessages.id, messageId));
  }

  async markProcessed(userId: string, messageId: string) {
    const now = new Date();
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(conversationMessages)
        .set({ status: "processed", processingStartedAt: null, updatedAt: now })
        .where(eq(conversationMessages.id, messageId));
      await transaction
        .insert(conversationStates)
        .values({ userId, lastProcessedMessageId: messageId })
        .onConflictDoUpdate({
          target: conversationStates.userId,
          set: { lastProcessedMessageId: messageId, updatedAt: now },
        });
    });
  }

  async getPendingAction(userId: string) {
    const [state] = await this.database
      .select({ pendingAction: conversationStates.pendingAction, expiresAt: conversationStates.pendingActionExpiresAt })
      .from(conversationStates)
      .where(eq(conversationStates.userId, userId))
      .limit(1);
    return state ? parsePending(state.pendingAction, state.expiresAt) : null;
  }

  async savePendingAction(userId: string, action: StoredPendingAction) {
    const pendingAction = action.entity === "reschedule_confirmation"
      ? {
          entity: action.entity,
          taskId: action.taskId,
          taskTitle: action.taskTitle,
          proposedAt: action.proposedAt.toISOString(),
          createdByMessageId: action.createdByMessageId,
        }
      : {
          entity: action.entity,
          command: action.command,
          candidates: action.candidates,
          createdByMessageId: action.createdByMessageId,
        };
    await this.database
      .insert(conversationStates)
      .values({ userId, pendingAction, pendingActionExpiresAt: action.expiresAt })
      .onConflictDoUpdate({
        target: conversationStates.userId,
        set: { pendingAction, pendingActionExpiresAt: action.expiresAt, updatedAt: new Date() },
      });
  }

  async clearPendingAction(userId: string) {
    await this.database
      .update(conversationStates)
      .set({ pendingAction: null, pendingActionExpiresAt: null, updatedAt: new Date() })
      .where(eq(conversationStates.userId, userId));
  }

  async applyOnboarding(input: Parameters<ConversationRepository["applyOnboarding"]>[0]) {
    await this.database
      .update(users)
      .set({ onboardingState: input.nextState, ...input.updates, updatedAt: new Date() })
      .where(eq(users.id, input.userId));
  }
}
