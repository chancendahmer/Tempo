export type PendingInterventionOutcome = {
  interventionId: string;
  taskId: string | null;
  hasProgress: boolean;
  style: "micro_start" | "direct_nudge" | "task_breakdown" | "body_doubling" | "reschedule";
  proposedAt?: Date | null;
};

export interface OutcomeRepository {
  findPending(userId: string, now: Date): Promise<PendingInterventionOutcome | null>;
  record(input: {
    interventionId: string;
    sourceMessageId: string;
    source: "explicit_reply" | "task_status_change";
    userResponse?: string;
    startedAt?: Date;
    completedAt?: Date;
    helpful?: boolean;
    now: Date;
  }): Promise<void>;
  findRecentForTask(userId: string, taskId: string, now: Date): Promise<string | null>;
  recordTimeout(interventionId: string, now: Date): Promise<void>;
  confirmReschedule(input: {
    interventionId: string;
    taskId: string;
    sourceMessageId: string;
    proposedAt: Date;
    now: Date;
  }): Promise<string>;
}

export function classifyOutcomeReply(body: string, hasProgress: boolean):
  | { started: boolean; completed: boolean; helpful?: boolean }
  | null {
  const normalized = body.trim().toLowerCase();
  if (hasProgress) {
    if (/\b(not helpful|wrong nudge|wrong time|didn'?t help|no)\b/.test(normalized)) return { started: false, completed: false, helpful: false };
    if (/\b(helpful|helped|good nudge|yes|yeah|yep)\b/.test(normalized)) return { started: false, completed: false, helpful: true };
    return null;
  }
  if (/\b(done|finished|completed)\b/.test(normalized)) return { started: true, completed: true };
  if (/\b(start|started|starting|working on it|doing it|yes|yeah|yep)\b/.test(normalized)) return { started: true, completed: false };
  if (/\b(not yet|didn'?t start|couldn'?t|wrong time|no)\b/.test(normalized)) return { started: false, completed: false, helpful: false };
  return null;
}

export class OutcomeTracker {
  constructor(private readonly repository: OutcomeRepository) {}

  async tryHandleStandaloneReply(input: { userId: string; messageId: string; body: string; now: Date }) {
    const pending = await this.repository.findPending(input.userId, input.now);
    if (!pending) return null;
    if (
      pending.style === "reschedule" &&
      pending.taskId &&
      pending.proposedAt &&
      /^(yes|yeah|yep|confirm|sounds good)[.!\s]*$/i.test(input.body.trim())
    ) {
      const title = await this.repository.confirmReschedule({
        interventionId: pending.interventionId,
        taskId: pending.taskId,
        sourceMessageId: input.messageId,
        proposedAt: pending.proposedAt,
        now: input.now,
      });
      return `Moved ${title} to ${pending.proposedAt.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}.`;
    }
    const classification = classifyOutcomeReply(input.body, pending.hasProgress);
    if (!classification) return null;
    await this.repository.record({
      interventionId: pending.interventionId,
      sourceMessageId: input.messageId,
      source: "explicit_reply",
      userResponse: input.body,
      startedAt: classification.started ? input.now : undefined,
      completedAt: classification.completed ? input.now : undefined,
      helpful: classification.helpful,
      now: input.now,
    });
    if (classification.helpful === true) return "Good to know—I’ll use more nudges like that.";
    if (classification.helpful === false) return "Got it. I’ll back off and adjust the next nudge.";
    return "Nice. Did that nudge help, or was it the wrong nudge?";
  }

  async attributeTaskProgress(input: {
    userId: string;
    taskId: string;
    messageId: string;
    event: "started" | "completed";
    now: Date;
  }) {
    const interventionId = await this.repository.findRecentForTask(input.userId, input.taskId, input.now);
    if (!interventionId) return false;
    await this.repository.record({
      interventionId,
      sourceMessageId: input.messageId,
      source: "task_status_change",
      startedAt: input.now,
      completedAt: input.event === "completed" ? input.now : undefined,
      now: input.now,
    });
    return true;
  }
}
