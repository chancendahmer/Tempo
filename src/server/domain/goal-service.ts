import { GoalCommand, GoalSummary, resolveGoalReference } from "./goal-commands";

export type GoalRecord = GoalSummary & { description: string | null };
export type GoalMutation = {
  title?: string;
  description?: string | null;
  status?: GoalRecord["status"];
  completedAt?: Date | null;
  abandonedAt?: Date | null;
};

export interface GoalRepository {
  findActionBySourceMessage(sourceMessageId: string): Promise<{
    goal: GoalRecord;
    eventType: "created" | "updated" | "completed" | "abandoned";
  } | null>;
  create(input: { userId: string; sourceMessageId: string; title: string; description?: string }): Promise<GoalRecord>;
  list(userId: string, status: "active" | "completed" | "all"): Promise<GoalRecord[]>;
  listForResolution(userId: string): Promise<GoalRecord[]>;
  mutate(input: {
    userId: string;
    goalId: string;
    sourceMessageId: string;
    eventType: "updated" | "completed" | "abandoned";
    changes: GoalMutation;
  }): Promise<GoalRecord>;
}

export type PendingGoalAction = {
  command: Exclude<GoalCommand, { type: "create_goal" } | { type: "list_goals" }>;
  candidates: Array<{ id: string; title: string }>;
};

export type GoalExecutionResult =
  | { kind: "executed"; reply: string; goal?: GoalRecord }
  | { kind: "needs_confirmation"; reply: string; pending: PendingGoalAction }
  | { kind: "not_found"; reply: string };

export function replyForGoalAction(
  action: "created" | "updated" | "completed" | "abandoned",
  goal: GoalRecord,
) {
  return {
    created: `Goal added: ${goal.title}.`,
    updated: `Goal updated: ${goal.title}.`,
    completed: `Goal achieved: ${goal.title}.`,
    abandoned: `Goal removed from your active list: ${goal.title}.`,
  }[action];
}

export async function executeGoalCommand(
  repository: GoalRepository,
  command: GoalCommand,
  context: { userId: string; sourceMessageId: string; now: Date },
): Promise<GoalExecutionResult> {
  if (command.type !== "list_goals") {
    const prior = await repository.findActionBySourceMessage(context.sourceMessageId);
    if (prior) return { kind: "executed", goal: prior.goal, reply: replyForGoalAction(prior.eventType, prior.goal) };
  }
  if (command.type === "create_goal") {
    const goal = await repository.create({
      userId: context.userId,
      sourceMessageId: context.sourceMessageId,
      title: command.title,
      description: command.description,
    });
    return { kind: "executed", goal, reply: replyForGoalAction("created", goal) };
  }
  if (command.type === "list_goals") {
    const goals = await repository.list(context.userId, command.status);
    if (goals.length === 0) return { kind: "executed", reply: "You don’t have any goals in that list." };
    return { kind: "executed", reply: goals.slice(0, 8).map((goal, index) => `${index + 1}. ${goal.title}`).join("\n") };
  }
  const resolution = resolveGoalReference(await repository.listForResolution(context.userId), command);
  if (resolution.kind === "not_found") {
    return { kind: "not_found", reply: "I couldn’t find that goal. Text “list my goals” to see the active list." };
  }
  if (resolution.kind === "ambiguous") {
    const candidates = resolution.candidates.slice(0, 5).map(({ id, title }) => ({ id, title }));
    return {
      kind: "needs_confirmation",
      pending: { command, candidates },
      reply: `Which goal did you mean?\n${candidates.map((goal, index) => `${index + 1}. ${goal.title}`).join("\n")}`,
    };
  }
  return executeResolvedGoalCommand(repository, command, resolution.goal.id, context);
}

export async function executeResolvedGoalCommand(
  repository: GoalRepository,
  command: Exclude<GoalCommand, { type: "create_goal" } | { type: "list_goals" }>,
  goalId: string,
  context: { userId: string; sourceMessageId: string; now: Date },
): Promise<GoalExecutionResult> {
  const prior = await repository.findActionBySourceMessage(context.sourceMessageId);
  if (prior) return { kind: "executed", goal: prior.goal, reply: replyForGoalAction(prior.eventType, prior.goal) };
  const eventType = command.type === "complete_goal" ? "completed" : command.type === "abandon_goal" ? "abandoned" : "updated";
  const changes: GoalMutation = command.type === "complete_goal"
    ? { status: "completed", completedAt: context.now }
    : command.type === "abandon_goal"
      ? { status: "abandoned", abandonedAt: context.now }
      : command.patch;
  const goal = await repository.mutate({
    userId: context.userId,
    goalId,
    sourceMessageId: context.sourceMessageId,
    eventType,
    changes,
  });
  return { kind: "executed", goal, reply: replyForGoalAction(eventType, goal) };
}

export function resolvePendingGoalChoice(
  pending: PendingGoalAction,
  reply: string,
): { goalId: string } | { error: string } {
  const number = Number(reply.trim());
  if (Number.isInteger(number) && number >= 1 && number <= pending.candidates.length) {
    return { goalId: pending.candidates[number - 1].id };
  }
  const resolution = resolveGoalReference(
    pending.candidates.map((goal) => ({ ...goal, status: "active" as const })),
    { goalQuery: reply.trim() },
  );
  if (resolution.kind === "resolved") return { goalId: resolution.goal.id };
  return { error: "Reply with the goal number or a more specific title." };
}
