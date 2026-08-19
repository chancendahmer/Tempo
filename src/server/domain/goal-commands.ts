import { z } from "zod";

const goalReference = {
  goalId: z.uuid().optional(),
  goalQuery: z.string().trim().min(1).max(240).optional(),
};

export const goalCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_goal"),
    title: z.string().trim().min(3).max(240),
    description: z.string().trim().min(1).max(1000).optional(),
  }),
  z.object({
    type: z.literal("list_goals"),
    status: z.enum(["active", "completed", "all"]).default("active"),
  }),
  z.object({ type: z.literal("complete_goal"), ...goalReference }),
  z.object({ type: z.literal("abandon_goal"), ...goalReference }),
  z.object({
    type: z.literal("update_goal"),
    ...goalReference,
    patch: z.object({
      title: z.string().trim().min(3).max(240).optional(),
      description: z.string().trim().min(1).max(1000).nullable().optional(),
    }),
  }),
]).superRefine((command, context) => {
  if (command.type === "create_goal" || command.type === "list_goals") return;
  if (!command.goalId && !command.goalQuery) {
    context.addIssue({ code: "custom", message: "A goal reference is required." });
  }
  if (command.type === "update_goal" && Object.keys(command.patch).length === 0) {
    context.addIssue({ code: "custom", message: "At least one goal update is required." });
  }
});

export type GoalCommand = z.infer<typeof goalCommandSchema>;

export type GoalSummary = {
  id: string;
  title: string;
  status: "active" | "completed" | "abandoned";
};

export type GoalResolution =
  | { kind: "resolved"; goal: GoalSummary }
  | { kind: "not_found" }
  | { kind: "ambiguous"; candidates: GoalSummary[] };

function normalizedTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function resolveGoalReference(
  goals: GoalSummary[],
  reference: { goalId?: string; goalQuery?: string },
): GoalResolution {
  if (reference.goalId) {
    const goal = goals.find((candidate) => candidate.id === reference.goalId);
    return goal ? { kind: "resolved", goal } : { kind: "not_found" };
  }
  const query = normalizedTitle(reference.goalQuery ?? "");
  if (!query) return { kind: "not_found" };
  const exact = goals.filter((goal) => normalizedTitle(goal.title) === query);
  if (exact.length === 1) return { kind: "resolved", goal: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact };
  const partial = goals.filter((goal) => {
    const title = normalizedTitle(goal.title);
    return title.includes(query) || query.includes(title);
  });
  if (partial.length === 1) return { kind: "resolved", goal: partial[0] };
  if (partial.length > 1) return { kind: "ambiguous", candidates: partial };
  return { kind: "not_found" };
}

function cleanGoalTitle(value: string): string {
  return value.replace(/[.!?]+$/, "").trim();
}

export function parseGoalCommandHeuristically(text: string): GoalCommand | null {
  const trimmed = text.trim();
  if (/^(?:list|show)(?:\s+me)?\s+(?:my\s+)?goals|^what(?:'s|\s+is)\s+(?:one\s+of\s+)?my\s+goals/i.test(trimmed)) {
    return goalCommandSchema.parse({ type: "list_goals", status: "active" });
  }
  const create = trimmed.match(/^(?:my\s+goal\s+is\s+to|set\s+(?:a\s+)?goal\s+to|new\s+goal:?|i\s+want\s+to\s+make\s+it\s+a\s+goal\s+to)\s+(.+)$/i);
  if (create) return goalCommandSchema.parse({ type: "create_goal", title: cleanGoalTitle(create[1]) });
  const complete = trimmed.match(/^(?:i\s+)?(?:achieved|completed|finished)\s+(?:my\s+)?goal(?:\s+of|\s+to|:)?\s+(.+)$/i);
  if (complete) return goalCommandSchema.parse({ type: "complete_goal", goalQuery: cleanGoalTitle(complete[1]) });
  const abandon = trimmed.match(/^(?:abandon|drop|cancel)\s+(?:my\s+)?goal(?:\s+of|\s+to|:)?\s+(.+)$/i);
  if (abandon) return goalCommandSchema.parse({ type: "abandon_goal", goalQuery: cleanGoalTitle(abandon[1]) });
  return null;
}
