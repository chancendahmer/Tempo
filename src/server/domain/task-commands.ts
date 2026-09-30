import { z } from "zod";

const taskReference = {
  taskId: z.uuid().optional(),
  taskQuery: z.string().trim().min(1).max(240).optional(),
};

export const taskCommandSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("create_task"),
      title: z.string().trim().min(3).max(240),
      estimatedMinutes: z.number().int().min(1).max(1440).optional(),
      dueAt: z.iso.datetime({ offset: true }).optional(),
      goalId: z.uuid().optional(),
    }),
    z.object({
      type: z.literal("list_tasks"),
      status: z.enum(["open", "completed", "all"]).default("open"),
    }),
    z.object({
      type: z.literal("start_task"),
      ...taskReference,
    }),
    z.object({
      type: z.literal("complete_task"),
      ...taskReference,
    }),
    z.object({
      type: z.literal("abandon_task"),
      ...taskReference,
    }),
    z.object({
      type: z.literal("update_task"),
      ...taskReference,
      patch: z.object({
        title: z.string().trim().min(3).max(240).optional(),
        estimatedMinutes: z.number().int().min(1).max(1440).nullable().optional(),
        dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
      }),
    }),
  ])
  .superRefine((command, context) => {
    if (command.type === "create_task" || command.type === "list_tasks") return;
    if (!command.taskId && !command.taskQuery) {
      context.addIssue({ code: "custom", message: "A task reference is required." });
    }
    if (command.type === "update_task" && Object.keys(command.patch).length === 0) {
      context.addIssue({ code: "custom", message: "At least one task update is required." });
    }
  });

export type TaskCommand = z.infer<typeof taskCommandSchema>;

function estimatedMinutes(text: string): number | undefined {
  const hours = text.match(/\b(?:probably\s+)?(?:a\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const minutes = text.match(/\b(?:probably\s+)?(?:a\s+)?(\d+)\s*(?:minutes?|mins?)\b/i);
  return minutes ? Number(minutes[1]) : undefined;
}

function cleanReference(input: string): string {
  return input
    .replace(/^(?:the|my)\s+/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

function createTaskFromNaturalLanguage(text: string): TaskCommand | null {
  if (!/^(?:i\s+need\s+to|i\s+have\s+to|remember\s+to|add\s+(?:a\s+)?task(?:\s+to)?|new\s+task:?)/i.test(text.trim())) {
    return null;
  }

  const duration = estimatedMinutes(text);
  // The fast path only owns a plain title plus an optional numeric duration
  // suffix. Dates, clocks and compound requests need the contextual parser.
  const plain = text.replace(/\s*,?\s*(?:probably\s+)?(?:a\s+)?\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?)\s*(?:job)?[.!]?\s*$/i, "");
  if (/[.!?]\s+\S|\d\s*:\s*\d|\b\d+\s*[ap]\.?m\.?\b|\b(?:today|tomorrow|tonight|morning|afternoon|evening|noon|midnight|sunday|monday|tuesday|wednesday|thursday|friday|saturday|january|february|march|april|may|june|july|august|september|october|november|december|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|year|deadline|due|by|before|after|at|then)\b|\d[/-]\d/i.test(plain)) return null;

  const title = text
    .trim()
    .replace(/^(?:i\s+need\s+to|i\s+have\s+to|remember\s+to|add\s+(?:a\s+)?task(?:\s+to)?|new\s+task:?)\s*/i, "")
    .replace(/\s*,?\s*(?:probably\s+)?(?:a\s+)?\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?)\s*(?:job)?\s*$/i, "")
    .replace(/\s+by\s+(?:tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, "")
    .replace(/[.!]+$/, "")
    .trim();

  return taskCommandSchema.parse({
    type: "create_task",
    title,
    estimatedMinutes: duration,

  });
}

export function parseTaskCommandHeuristically(text: string, _reference = new Date()): TaskCommand | null {
  void _reference; // Retained call signature; dated requests now use the contextual parser.
  const trimmed = text.trim();
  if (/^(?:list|show)(?:\s+me)?\s+(?:my\s+)?tasks|^what(?:'s|\s+is)\s+on\s+my\s+list/i.test(trimmed)) {
    return taskCommandSchema.parse({ type: "list_tasks", status: "open" });
  }

  const complete = trimmed.match(/^(?:i(?:'m|\s+am)?\s+)?(?:done\s+with|finished|completed)\s+(.+)$/i);
  if (complete) return taskCommandSchema.parse({ type: "complete_task", taskQuery: cleanReference(complete[1]) });

  const start = trimmed.match(/^(?:start|begin|i(?:'m|\s+am)\s+starting)\s+(.+)$/i);
  if (start) return taskCommandSchema.parse({ type: "start_task", taskQuery: cleanReference(start[1]) });

  const abandon = trimmed.match(/^(?:abandon|drop|cancel)\s+(.+)$/i);
  if (abandon) return taskCommandSchema.parse({ type: "abandon_task", taskQuery: cleanReference(abandon[1]) });

  return createTaskFromNaturalLanguage(trimmed);
}

export type TaskSummary = {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "completed" | "abandoned";
};

export type TaskResolution =
  | { kind: "resolved"; task: TaskSummary }
  | { kind: "not_found" }
  | { kind: "ambiguous"; candidates: TaskSummary[] };

function normalizedTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function resolveTaskReference(
  tasks: TaskSummary[],
  reference: { taskId?: string; taskQuery?: string },
): TaskResolution {
  if (reference.taskId) {
    const task = tasks.find((candidate) => candidate.id === reference.taskId);
    return task ? { kind: "resolved", task } : { kind: "not_found" };
  }

  const query = normalizedTitle(reference.taskQuery ?? "");
  if (!query) return { kind: "not_found" };
  const exact = tasks.filter((task) => normalizedTitle(task.title) === query);
  if (exact.length === 1) return { kind: "resolved", task: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact };

  const partial = tasks.filter((task) => {
    const title = normalizedTitle(task.title);
    return title.includes(query) || query.includes(title);
  });
  if (partial.length === 1) return { kind: "resolved", task: partial[0] };
  if (partial.length > 1) return { kind: "ambiguous", candidates: partial };
  return { kind: "not_found" };
}
