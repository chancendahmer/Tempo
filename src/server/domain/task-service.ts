import { TaskCommand, TaskSummary, resolveTaskReference } from "./task-commands";

export type TaskRecord = TaskSummary & {
  goalId: string | null;
  estimatedMinutes: number | null;
  dueAt: Date | null;
};

export type TaskMutation = {
  title?: string;
  estimatedMinutes?: number | null;
  dueAt?: Date | null;
  status?: TaskRecord["status"];
  startedAt?: Date | null;
  completedAt?: Date | null;
  abandonedAt?: Date | null;
};

export interface TaskRepository {
  findActionBySourceMessage(sourceMessageId: string): Promise<{
    task: TaskRecord;
    eventType: "created" | "updated" | "started" | "completed" | "abandoned";
  } | null>;
  create(input: {
    userId: string;
    sourceMessageId: string;
    title: string;
    estimatedMinutes?: number;
    dueAt?: Date;
    goalId?: string;
  }): Promise<TaskRecord>;
  list(userId: string, status: "open" | "completed" | "all"): Promise<TaskRecord[]>;
  listForResolution(userId: string): Promise<TaskRecord[]>;
  mutate(input: {
    userId: string;
    taskId: string;
    sourceMessageId: string;
    eventType: "updated" | "started" | "completed" | "abandoned";
    changes: TaskMutation;
  }): Promise<TaskRecord>;
}

export type PendingTaskAction = {
  command: Exclude<TaskCommand, { type: "create_task" } | { type: "list_tasks" }>;
  candidates: Array<{ id: string; title: string }>;
};

export type TaskExecutionResult =
  | { kind: "executed"; reply: string; task?: TaskRecord }
  | { kind: "needs_confirmation"; reply: string; pending: PendingTaskAction }
  | { kind: "not_found"; reply: string };

export function replyForTaskAction(
  action: "created" | "updated" | "started" | "completed" | "abandoned",
  task: TaskRecord,
): string {
  const replies = {
    created: `Added: ${task.title}.`,
    started: `Started: ${task.title}. Text me when you stop or finish.`,
    completed: `Done: ${task.title}.`,
    abandoned: `Removed from your active list: ${task.title}.`,
    updated: `Updated: ${task.title}.`,
  } as const;
  return replies[action];
}

export async function executeTaskCommand(
  repository: TaskRepository,
  command: TaskCommand,
  context: { userId: string; sourceMessageId: string; now: Date },
): Promise<TaskExecutionResult> {
  if (command.type !== "list_tasks") {
    const priorAction = await repository.findActionBySourceMessage(context.sourceMessageId);
    if (priorAction) {
      return {
        kind: "executed",
        task: priorAction.task,
        reply: replyForTaskAction(priorAction.eventType, priorAction.task),
      };
    }
  }

  if (command.type === "create_task") {
    const task = await repository.create({
      userId: context.userId,
      sourceMessageId: context.sourceMessageId,
      title: command.title,
      estimatedMinutes: command.estimatedMinutes,
      dueAt: command.dueAt ? new Date(command.dueAt) : undefined,
      goalId: command.goalId,
    });
    return { kind: "executed", task, reply: `Added: ${task.title}.` };
  }

  if (command.type === "list_tasks") {
    const tasks = await repository.list(context.userId, command.status);
    if (tasks.length === 0) return { kind: "executed", reply: "Your task list is clear." };
    return {
      kind: "executed",
      reply: tasks.slice(0, 8).map((task, index) => `${index + 1}. ${task.title}`).join("\n"),
    };
  }

  const tasks = await repository.listForResolution(context.userId);
  const resolution = resolveTaskReference(tasks, command);
  if (resolution.kind === "not_found") {
    return { kind: "not_found", reply: "I couldn’t find that task. Text “list my tasks” to see the current list." };
  }
  if (resolution.kind === "ambiguous") {
    const candidates = resolution.candidates.slice(0, 5).map(({ id, title }) => ({ id, title }));
    return {
      kind: "needs_confirmation",
      pending: { command, candidates },
      reply: `Which task did you mean?\n${candidates.map((task, index) => `${index + 1}. ${task.title}`).join("\n")}`,
    };
  }

  return executeResolvedTaskCommand(repository, command, resolution.task.id, context);
}

export async function executeResolvedTaskCommand(
  repository: TaskRepository,
  command: Exclude<TaskCommand, { type: "create_task" } | { type: "list_tasks" }>,
  taskId: string,
  context: { userId: string; sourceMessageId: string; now: Date },
): Promise<TaskExecutionResult> {
  const priorAction = await repository.findActionBySourceMessage(context.sourceMessageId);
  if (priorAction) {
    return {
      kind: "executed",
      task: priorAction.task,
      reply: replyForTaskAction(priorAction.eventType, priorAction.task),
    };
  }

  let eventType: "updated" | "started" | "completed" | "abandoned";
  let changes: TaskMutation;

  switch (command.type) {
    case "start_task":
      eventType = "started";
      changes = { status: "in_progress", startedAt: context.now };
      break;
    case "complete_task":
      eventType = "completed";
      changes = { status: "completed", completedAt: context.now };
      break;
    case "abandon_task":
      eventType = "abandoned";
      changes = { status: "abandoned", abandonedAt: context.now };
      break;
    case "update_task":
      eventType = "updated";
      changes = {
        ...command.patch,
        dueAt:
          command.patch.dueAt === undefined
            ? undefined
            : command.patch.dueAt === null
              ? null
              : new Date(command.patch.dueAt),
      };
      break;
  }

  const task = await repository.mutate({
    userId: context.userId,
    taskId,
    sourceMessageId: context.sourceMessageId,
    eventType,
    changes,
  });
  return { kind: "executed", task, reply: replyForTaskAction(eventType, task) };
}

export function resolvePendingTaskChoice(
  pending: PendingTaskAction,
  reply: string,
): { taskId: string } | { error: string } {
  const trimmed = reply.trim();
  const number = Number(trimmed);
  if (Number.isInteger(number) && number >= 1 && number <= pending.candidates.length) {
    return { taskId: pending.candidates[number - 1].id };
  }

  const resolution = resolveTaskReference(
    pending.candidates.map((task) => ({ ...task, status: "not_started" as const })),
    { taskQuery: trimmed },
  );
  if (resolution.kind === "resolved") return { taskId: resolution.task.id };
  return { error: "Reply with the task number or a more specific title." };
}
