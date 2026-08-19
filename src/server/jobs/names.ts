export const JOB_NAMES = {
  sendWelcome: "tempo.send-welcome",
  processInbound: "tempo.process-inbound",
  syncCalendar: "tempo.sync-calendar",
  evaluateContext: "tempo.evaluate-context",
  deliverIntervention: "tempo.deliver-intervention",
  feedbackFollowup: "tempo.feedback-followup",
  feedbackTimeout: "tempo.feedback-timeout",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export type SendWelcomeJob = {
  scheduledActionId: string;
  userId: string;
  idempotencyKey: string;
};

export type ProcessInboundJob = {
  scheduledActionId: string;
  userId: string;
  messageId: string;
};

export type SyncCalendarJob = {
  scheduledActionId: string;
  userId: string;
};

export type EvaluateContextJob = {
  scheduledActionId: string;
  userId: string;
};

export type DeliverInterventionJob = {
  scheduledActionId: string;
  userId: string;
  interventionId: string;
};

export type FeedbackFollowupJob = DeliverInterventionJob;
export type FeedbackTimeoutJob = DeliverInterventionJob;
