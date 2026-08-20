import { ContextSignals, ContextTask } from "./context-engine";

export type InterventionStyle = "micro_start" | "direct_nudge" | "task_breakdown" | "body_doubling" | "reschedule";

export function selectInterventionStyle(task: ContextTask, signals: ContextSignals, now: Date): InterventionStyle {
  const canOfferConcreteReschedule = signals.calendarAvailable && Boolean(signals.nextFreeAt);
  const availableTooShort = Boolean(
    canOfferConcreteReschedule && task.estimatedMinutes && signals.freeMinutes < Math.min(30, task.estimatedMinutes),
  );
  if (canOfferConcreteReschedule && (signals.repeatedNonStarts >= 2 || availableTooShort)) return "reschedule";
  if (signals.preferredCoachingStyle) return signals.preferredCoachingStyle;
  if (signals.bodyDoublingAffinity) return "body_doubling";
  if ((task.estimatedMinutes ?? 0) >= 90) return "task_breakdown";
  if (task.dueAt && task.dueAt.getTime() - now.getTime() <= 24 * 3_600_000) return "direct_nudge";
  return "micro_start";
}

export interface InterventionComposer {
  compose(input: {
    style: InterventionStyle;
    taskTitle: string;
    dueAt?: Date | null;
    estimatedMinutes?: number | null;
    freeMinutes: number;
    nextFreeAt?: Date | null;
    timezone?: string;
    tone: "gentle" | "balanced" | "direct";
    memories: string[];
  }): Promise<string>;
}

export function fallbackIntervention(input: Parameters<InterventionComposer["compose"]>[0]): string {
  const title = input.taskTitle;
  switch (input.style) {
    case "micro_start": return `${title}: give it two minutes and do only the very first step.`;
    case "direct_nudge": return `${title} is getting close. You have a window now—will you start the first 10 minutes?`;
    case "task_breakdown": return `${title} looks big. Pick one: 1) open it, 2) outline three steps, or 3) do the first step. Which one?`;
    case "body_doubling": return `Want company for ${title}? Start with one focused 15-minute block.`;
    case "reschedule": {
      const proposed = input.nextFreeAt
        ? input.nextFreeAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: input.timezone ?? "UTC" })
        : "the next open block";
      return `${title} doesn’t fit this window. Move it to ${proposed}? Reply YES to confirm or suggest another time.`;
    }
  }
}

const harmfulTone = /\b(lazy|failure|failed again|should have|what'?s wrong with you|no excuses)\b/i;

export function validateInterventionMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 320 || harmfulTone.test(normalized)) {
    throw new Error("Generated intervention violates SMS safety constraints");
  }
  return normalized;
}
