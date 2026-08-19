import { z } from "zod";
import { TaskRecord, TaskRepository } from "./task-service";
import { resolveTaskReference } from "./task-commands";

export const rescheduleCommandSchema = z.object({
  type: z.literal("reschedule_task"),
  taskId: z.uuid().optional(),
  taskQuery: z.string().trim().min(1).max(240).optional(),
  afterToday: z.boolean().default(false),
}).superRefine((command, context) => {
  if (!command.taskId && !command.taskQuery) context.addIssue({ code: "custom", message: "A task reference is required." });
});

export type RescheduleCommand = z.infer<typeof rescheduleCommandSchema>;

export interface SchedulingRepository {
  findNextFreeStart(input: {
    userId: string;
    now: Date;
    durationMinutes: number;
    afterToday: boolean;
  }): Promise<Date | null>;
}

export type RescheduleProposal =
  | { kind: "proposed"; task: TaskRecord; proposedAt: Date }
  | { kind: "ambiguous"; candidates: Array<{ id: string; title: string }> }
  | { kind: "not_found" }
  | { kind: "calendar_unavailable"; task: TaskRecord };

export function parseRescheduleHeuristically(body: string): RescheduleCommand | null {
  const trimmed = body.trim();
  const cannotToday = trimmed.match(/^(?:i\s+)?(?:can(?:'|’)t|cannot|won(?:'|’)t)\s+(?:do|work on|finish|start)\s+(.+?)\s+today[.!]?$/i);
  if (cannotToday) {
    return rescheduleCommandSchema.parse({
      type: "reschedule_task",
      taskQuery: cannotToday[1].replace(/^(?:the|my)\s+/i, "").trim(),
      afterToday: true,
    });
  }
  const reschedule = trimmed.match(/^(?:reschedule|move)\s+(.+?)(?:\s+for\s+later)?[.!]?$/i);
  return reschedule
    ? rescheduleCommandSchema.parse({
        type: "reschedule_task",
        taskQuery: reschedule[1].replace(/^(?:the|my)\s+/i, "").trim(),
        afterToday: false,
      })
    : null;
}

export async function proposeTaskReschedule(
  tasks: TaskRepository,
  scheduling: SchedulingRepository,
  command: RescheduleCommand,
  context: { userId: string; now: Date },
): Promise<RescheduleProposal> {
  const resolution = resolveTaskReference(await tasks.listForResolution(context.userId), command);
  if (resolution.kind === "not_found") return { kind: "not_found" };
  if (resolution.kind === "ambiguous") {
    return { kind: "ambiguous", candidates: resolution.candidates.slice(0, 5).map(({ id, title }) => ({ id, title })) };
  }
  return proposeResolvedTaskReschedule(tasks, scheduling, resolution.task.id, command.afterToday, context);
}

export async function proposeResolvedTaskReschedule(
  tasks: TaskRepository,
  scheduling: SchedulingRepository,
  taskId: string,
  afterToday: boolean,
  context: { userId: string; now: Date },
): Promise<RescheduleProposal> {
  const task = (await tasks.listForResolution(context.userId)).find((candidate) => candidate.id === taskId);
  if (!task) return { kind: "not_found" };
  const proposedAt = await scheduling.findNextFreeStart({
    userId: context.userId,
    now: context.now,
    durationMinutes: task.estimatedMinutes ?? 30,
    afterToday,
  });
  return proposedAt ? { kind: "proposed", task, proposedAt } : { kind: "calendar_unavailable", task };
}

export async function confirmTaskReschedule(
  tasks: TaskRepository,
  input: { userId: string; taskId: string; sourceMessageId: string; proposedAt: Date },
) {
  return tasks.mutate({
    userId: input.userId,
    taskId: input.taskId,
    sourceMessageId: input.sourceMessageId,
    eventType: "updated",
    changes: { dueAt: input.proposedAt },
  });
}

export function formatProposedTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
