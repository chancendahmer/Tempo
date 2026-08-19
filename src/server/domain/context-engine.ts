import { z } from "zod";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const contextWeightsSchema = z.object({
  taskUrgency: z.number().min(0).max(10),
  freeTime: z.number().min(0).max(10),
  idleGap: z.number().min(0).max(10),
  responseRate: z.number().min(0).max(10),
  recentContact: z.number().min(0).max(10),
});

export const contextSettingsSchema = z.object({
  dueHorizonHours: z.number().positive().max(720),
  minFreeMinutes: z.number().int().positive().max(480),
  idleGapCapMinutes: z.number().int().positive().max(43_200),
});

export type ContextPolicy = {
  id: string;
  version: string;
  threshold: number;
  holdoutBasisPoints: number;
  weights: z.infer<typeof contextWeightsSchema>;
  settings: z.infer<typeof contextSettingsSchema>;
};

export type ContextTask = {
  id: string;
  title: string;
  status: "not_started" | "in_progress";
  dueAt?: Date | null;
  estimatedMinutes?: number | null;
  createdAt: Date;
};

export type ContextSignals = {
  userId: string;
  status: "active" | "paused" | "opted_out" | "deleted";
  onboardingComplete: boolean;
  hasConsent: boolean;
  timezone: string;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  pausedUntil?: Date | null;
  calendarBusy: boolean;
  calendarAvailable: boolean;
  freeMinutes: number;
  nextFreeAt?: Date | null;
  dailyInterventionCount: number;
  dailyInterventionCap: number;
  minutesSinceLastIntervention?: number | null;
  interventionCooldownMinutes: number;
  hasPendingResponse: boolean;
  responseRate: number;
  coachingTone: "gentle" | "balanced" | "direct";
  preferredCoachingStyle?: "micro_start" | "direct_nudge" | "task_breakdown" | "body_doubling" | "reschedule" | null;
  repeatedNonStarts: number;
  bodyDoublingAffinity: boolean;
  tasks: ContextTask[];
};

export type ContextEvaluation = {
  task: ContextTask | null;
  decision: "blocked" | "shadow" | "holdout" | "send";
  score: number;
  reasonCodes: string[];
  scoreBreakdown: Record<string, number>;
  inputs: Record<string, unknown>;
  randomizedBucket: number;
  opportunityKey: string;
};

export const DEFAULT_CONTEXT_POLICY = {
  version: "context-v1.1.0",
  threshold: 0.58,
  holdoutBasisPoints: 1_000,
  weights: {
    taskUrgency: 0.34,
    freeTime: 0.22,
    idleGap: 0.2,
    responseRate: 0.14,
    recentContact: 0.24,
  },
  settings: {
    dueHorizonHours: 168,
    minFreeMinutes: 30,
    idleGapCapMinutes: 1_440,
  },
} as const;

function clockMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [hour, minute] = time.split(":").map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null;
}

export function localTime(now: Date, timezone: string): { minutes: number; bucket: string; date: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const minutes = hour * 60 + Number(parts.minute);
  const bucket = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 22 ? "evening" : "night";
  return { minutes, bucket, date: `${parts.year}-${parts.month}-${parts.day}` };
}

export function isQuietTime(now: Date, timezone: string, start?: string | null, end?: string | null): boolean {
  const startMinutes = clockMinutes(start);
  const endMinutes = clockMinutes(end);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;
  const current = localTime(now, timezone).minutes;
  return startMinutes < endMinutes
    ? current >= startMinutes && current < endMinutes
    : current >= startMinutes || current < endMinutes;
}

function urgency(task: ContextTask, now: Date, horizonHours: number): number {
  if (!task.dueAt) return task.status === "in_progress" ? 0.35 : 0.15;
  const hours = (task.dueAt.getTime() - now.getTime()) / 3_600_000;
  if (hours <= 0) return 1;
  return clamp01(1 - hours / horizonHours);
}

export function selectTask(tasks: ContextTask[], now: Date, dueHorizonHours: number): ContextTask | null {
  return [...tasks].sort((a, b) => {
    const score = (task: ContextTask) => urgency(task, now, dueHorizonHours) + (task.status === "in_progress" ? 0.15 : 0);
    const difference = score(b) - score(a);
    if (difference !== 0) return difference;
    const dueA = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const dueB = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return dueA - dueB || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
  })[0] ?? null;
}

export function interventionBucket(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 10_000;
}

export function evaluateContext(input: {
  signals: ContextSignals;
  policy: ContextPolicy;
  now: Date;
  shadowMode: boolean;
}): ContextEvaluation {
  const { signals, policy, now } = input;
  const task = selectTask(signals.tasks, now, policy.settings.dueHorizonHours);
  const opportunityKey = `${signals.userId}|${policy.version}|${Math.floor(now.getTime() / 900_000)}|${task?.id ?? "none"}`;
  const randomizedBucket = interventionBucket(opportunityKey);
  const local = localTime(now, signals.timezone);
  const reasonCodes: string[] = [];

  if (signals.status !== "active") reasonCodes.push(`user_${signals.status}`);
  if (!signals.hasConsent) reasonCodes.push("consent_missing");
  if (!signals.onboardingComplete) reasonCodes.push("onboarding_incomplete");
  if (signals.pausedUntil && signals.pausedUntil > now) reasonCodes.push("user_paused");
  if (isQuietTime(now, signals.timezone, signals.quietHoursStart, signals.quietHoursEnd)) reasonCodes.push("quiet_hours");
  if (signals.calendarBusy) reasonCodes.push("calendar_busy");
  if (!task) reasonCodes.push("no_actionable_task");
  if (signals.dailyInterventionCount >= signals.dailyInterventionCap) reasonCodes.push("daily_cap_reached");
  if (signals.hasPendingResponse) reasonCodes.push("pending_response");
  if (
    signals.minutesSinceLastIntervention !== null &&
    signals.minutesSinceLastIntervention !== undefined &&
    signals.minutesSinceLastIntervention < signals.interventionCooldownMinutes
  ) reasonCodes.push("cooldown_active");

  const urgencySignal = task ? urgency(task, now, policy.settings.dueHorizonHours) : 0;
  const targetFreeMinutes = Math.max(policy.settings.minFreeMinutes, task?.estimatedMinutes ?? 0);
  const freeTimeSignal = !signals.calendarAvailable || signals.calendarBusy
    ? 0
    : clamp01(signals.freeMinutes / targetFreeMinutes);
  const idleGapSignal = signals.minutesSinceLastIntervention == null
    ? 1
    : clamp01(signals.minutesSinceLastIntervention / policy.settings.idleGapCapMinutes);
  const responseRateSignal = clamp01(signals.responseRate);
  const recentContactSignal = signals.minutesSinceLastIntervention == null
    ? 0
    : clamp01(1 - signals.minutesSinceLastIntervention / Math.max(1, signals.interventionCooldownMinutes * 2));
  const scoreBreakdown = {
    taskUrgency: urgencySignal * policy.weights.taskUrgency,
    freeTime: freeTimeSignal * policy.weights.freeTime,
    idleGap: idleGapSignal * policy.weights.idleGap,
    responseRate: responseRateSignal * policy.weights.responseRate,
    recentContact: -recentContactSignal * policy.weights.recentContact,
  };
  const score = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  const hardBlocked = reasonCodes.length > 0;
  let decision: ContextEvaluation["decision"] = "blocked";
  if (!hardBlocked && score >= policy.threshold) {
    decision = input.shadowMode ? "shadow" : randomizedBucket < policy.holdoutBasisPoints ? "holdout" : "send";
    reasonCodes.push(input.shadowMode ? "above_threshold_shadow" : decision === "holdout" ? "randomized_holdout" : "above_threshold");
  } else if (!hardBlocked) {
    reasonCodes.push("below_threshold");
  }

  return {
    task,
    decision,
    score,
    reasonCodes,
    scoreBreakdown,
    inputs: {
      policyVersion: policy.version,
      localTimeBucket: local.bucket,
      localDate: local.date,
      freeMinutes: signals.freeMinutes,
      calendarAvailable: signals.calendarAvailable,
      nextFreeAt: signals.nextFreeAt?.toISOString() ?? null,
      dailyInterventionCount: signals.dailyInterventionCount,
      dailyInterventionCap: signals.dailyInterventionCap,
      minutesSinceLastIntervention: signals.minutesSinceLastIntervention ?? null,
      responseRate: signals.responseRate,
      selectedTaskStatus: task?.status ?? null,
      selectedTaskDueAt: task?.dueAt?.toISOString() ?? null,
      selectedTaskEstimatedMinutes: task?.estimatedMinutes ?? null,
      opportunityKey,
    },
    randomizedBucket,
    opportunityKey,
  };
}
