import type { TaskCommand } from "../../server/domain/task-commands";
import type { Workspace } from "./workspace-data";

export function findNewTaskId(
  previousIds: ReadonlySet<string> | null,
  updated: Pick<Workspace, "tasks" | "tasksTruncated"> | undefined,
  command: Extract<TaskCommand, { type: "create_task" }>,
): string | undefined {
  if (!previousIds || !updated || updated.tasksTruncated) return;
  const title = command.title.trim();
  const dueAt = command.dueAt === undefined ? null : Date.parse(command.dueAt);
  const matches = updated.tasks.filter(task =>
    !previousIds.has(task.id) && task.status === "not_started" && task.title === title &&
    (task.dueAt === null ? null : Date.parse(task.dueAt)) === dueAt &&
    task.estimatedMinutes === (command.estimatedMinutes ?? null) && task.goalId === (command.goalId ?? null),
  );
  return matches.length === 1 ? matches[0].id : undefined;
}
