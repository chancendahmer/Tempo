export const JOB_NAMES = {
  sendWelcome: "tempo.send-welcome",
  sendCompliance: "tempo.send-compliance",
  processInbound: "tempo.process-inbound",
  deliverReminder: "tempo.deliver-reminder",
  syncCalendar: "tempo.sync-calendar",
  evaluateContext: "tempo.evaluate-context",
  deliverIntervention: "tempo.deliver-intervention",
  accountabilityFollowup: "tempo.accountability-followup",
  feedbackFollowup: "tempo.feedback-followup",
  feedbackTimeout: "tempo.feedback-timeout",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export type SendWelcomeJob = {
  scheduledActionId: string;
  userId: string;
  idempotencyKey: string;
};

export type SendComplianceJob = SendWelcomeJob;

export type ProcessInboundJob = {
  scheduledActionId: string;
  userId: string;
  messageId: string;
};

export type SyncCalendarJob = {
  scheduledActionId: string;
  userId: string;
};

export type DeliverReminderJob = {
  scheduledActionId: string;
  userId: string;
  reminderId: string;
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
export type AccountabilityFollowupJob = DeliverInterventionJob;
