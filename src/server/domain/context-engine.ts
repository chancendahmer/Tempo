import { z } from "zod";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const MINUTE_MS = 60_000;
export const WORKSPACE_ACTIVITY_WINDOW_MS = 15 * MINUTE_MS;
export const LINKED_THOUGHT_WINDOW_MS = 24 * 60 * MINUTE_MS;
const WORKSPACE_WEIGHTS = { routineOverlap: 0.24, recentWorkspaceActivity: 0.16, linkedThought: 0.08 };

export const contextWeightsSchema = z.object({
  taskUrgency: z.number().min(0).max(10),
  freeTime: z.number().min(0).max(10),
  idleGap: z.number().min(0).max(10),
  responseRate: z.number().min(0).max(10),
  recentContact: z.number().min(0).max(10),
  routineOverlap: z.number().min(0).max(10).optional(),
  recentWorkspaceActivity: z.number().min(0).max(10).optional(),
  linkedThought: z.number().min(0).max(10).optional(),
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

export type WorkspaceContext = {
  focusUntil: Date | null;
  routines: Array<{ time: string; steps: Array<{ minutes: number; completedOn: string | null }> }>;
  latestActivityAt: Date | null;
  linkedThoughts: ReadonlyMap<string, Date>;
};

export type ContextSignals = {
  userId: string;
  status: "active" | "paused" | "opted_out" | "deleted";
  onboardingComplete: boolean;
  hasConsent: boolean;
  proactiveOptIn: boolean;
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
  lastUserMessageAt?: Date | null;
  responseRate: number;
  coachingTone: "gentle" | "balanced" | "direct";
  preferredCoachingStyle?: "micro_start" | "direct_nudge" | "task_breakdown" | "body_doubling" | "reschedule" | null;
  repeatedNonStarts: number;
  bodyDoublingAffinity: boolean;
  workspace?: WorkspaceContext;
  extensionSignals?: Array<{
    extensionKey: string;
    signalType: string;
    payload: Record<string, unknown>;
    confidence?: number | null;
  }>;
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
    ...WORKSPACE_WEIGHTS,
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
  return Number.isInteger(hour) && hour >= 0 && hour < 24 && Number.isInteger(minute) && minute >= 0 && minute < 60
    ? hour * 60 + minute : null;
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
  const hoursFromDeadline = Math.abs(task.dueAt.getTime() - now.getTime()) / 3_600_000;
  return clamp01(1 - hoursFromDeadline / horizonHours);
}

function selectTask(tasks: ContextTask[], score: (task: ContextTask) => number): ContextTask | null {
  return [...tasks].sort((a, b) => {
    const difference = score(b) - score(a);
    if (difference !== 0) return difference;
    if (a.status !== b.status) return a.status === "in_progress" ? -1 : 1;
    const dueA = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const dueB = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return dueA - dueB || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
  })[0] ?? null;
}

function freshness(at: Date | null | undefined, now: Date, windowMs: number): number {
  if (!at) return 0;
  const age = now.getTime() - at.getTime();
  return age >= 0 && age < windowMs ? 1 - age / windowMs : 0;
}

function routineOverlap(workspace: WorkspaceContext | undefined, local: ReturnType<typeof localTime>): number {
  let overlap = 0;
  for (const routine of workspace?.routines ?? []) {
    const starts = clockMinutes(routine.time);
    if (starts === null) continue;
    const minutes = routine.steps.filter(step => step.completedOn !== local.date)
      .reduce((sum, step) => sum + step.minutes, 0);
    if (minutes <= 0) continue;
    const elapsed = local.minutes - starts;
    if (elapsed >= -15 && elapsed < Math.min(minutes, 90)) {
      overlap = Math.max(overlap, clamp01(1 + elapsed / 15));
    }
  }
  return overlap;
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
  const {
    routineOverlap: routineWeight = WORKSPACE_WEIGHTS.routineOverlap,
    recentWorkspaceActivity: activityWeight = WORKSPACE_WEIGHTS.recentWorkspaceActivity,
    linkedThought: thoughtWeight = WORKSPACE_WEIGHTS.linkedThought,
    ...weights
  } = policy.weights;
  const taskScores = (task: ContextTask | null) => ({
    taskUrgency: (task ? urgency(task, now, policy.settings.dueHorizonHours) : 0) * weights.taskUrgency,
    freeTime: (signals.calendarAvailable && !signals.calendarBusy
      ? clamp01(signals.freeMinutes / Math.max(policy.settings.minFreeMinutes, task?.estimatedMinutes ?? 0)) : 0) * weights.freeTime,
    linkedThought: (task ? freshness(signals.workspace?.linkedThoughts.get(task.id), now, LINKED_THOUGHT_WINDOW_MS) : 0) * thoughtWeight,
  });
  const task = selectTask(signals.tasks, (candidate) => {
    const { taskUrgency, freeTime, linkedThought } = taskScores(candidate);
    return taskUrgency + freeTime + linkedThought;
  });
  const opportunityKey = `${signals.userId}|${policy.version}|${Math.floor(now.getTime() / 900_000)}|${task?.id ?? "none"}`;
  const randomizedBucket = interventionBucket(opportunityKey);
  const local = localTime(now, signals.timezone);
  const effectiveCooldownMinutes = Math.max(120, signals.interventionCooldownMinutes);
  const reasonCodes = proactiveBlockReasons(signals, now);
  if (!task) reasonCodes.push("no_actionable_task");
  if (signals.calendarAvailable && !signals.calendarBusy && signals.freeMinutes < 5) reasonCodes.push("no_checkin_window");

  const idleGapSignal = signals.minutesSinceLastIntervention == null
    ? 1
    : clamp01(signals.minutesSinceLastIntervention / policy.settings.idleGapCapMinutes);
  const responseRateSignal = clamp01(signals.responseRate);
  const recentContactSignal = signals.minutesSinceLastIntervention == null
    ? 0
    : clamp01(1 - signals.minutesSinceLastIntervention / Math.max(1, effectiveCooldownMinutes * 2));
  const scoreBreakdown = {
    ...taskScores(task),
    idleGap: idleGapSignal * policy.weights.idleGap,
    responseRate: responseRateSignal * policy.weights.responseRate,
    recentContact: -recentContactSignal * policy.weights.recentContact,
    routineOverlap: 0 - routineOverlap(signals.workspace, local) * routineWeight,
    recentWorkspaceActivity: 0 - freshness(signals.workspace?.latestActivityAt, now, WORKSPACE_ACTIVITY_WINDOW_MS) * activityWeight,
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
      scoreVersion: "workspace-v2",
      scorePercent: Math.round(score * 100),
      localTimeBucket: local.bucket,
      localDate: local.date,
      freeMinutes: signals.freeMinutes,
      calendarAvailable: signals.calendarAvailable,
      nextFreeAt: signals.nextFreeAt?.toISOString() ?? null,
      dailyInterventionCount: signals.dailyInterventionCount,
      dailyInterventionCap: signals.dailyInterventionCap,
      minutesSinceLastIntervention: signals.minutesSinceLastIntervention ?? null,
      effectiveCooldownMinutes,
      responseRate: signals.responseRate,
      selectedTaskStatus: task?.status ?? null,
      selectedTaskDueAt: task?.dueAt?.toISOString() ?? null,
      selectedTaskEstimatedMinutes: task?.estimatedMinutes ?? null,
      extensionSignals: signals.extensionSignals ?? [],
      opportunityKey,
    },
    randomizedBucket,
    opportunityKey,
  };
}

/** The same hard gates apply to every optional proactive contact. */
export function proactiveBlockReasons(signals: ContextSignals, now: Date): string[] {
  const reasons: string[] = [];
  if (signals.status !== "active") reasons.push(`user_${signals.status}`);
  if (!signals.hasConsent) reasons.push("consent_missing");
  if (!signals.proactiveOptIn) reasons.push("proactive_opt_in_missing");
  if (!signals.onboardingComplete) reasons.push("onboarding_incomplete");
  if (signals.pausedUntil && signals.pausedUntil > now) reasons.push("user_paused");
  if (isQuietTime(now, signals.timezone, signals.quietHoursStart, signals.quietHoursEnd)) reasons.push("quiet_hours");
  if (!signals.calendarAvailable) reasons.push("calendar_unavailable");
  if (signals.calendarBusy) reasons.push("calendar_busy");
  if (signals.workspace?.focusUntil && signals.workspace.focusUntil > now) reasons.push("active_focus");
  if (signals.dailyInterventionCount >= Math.min(3, signals.dailyInterventionCap)) reasons.push("daily_cap_reached");
  if (signals.hasPendingResponse) reasons.push("pending_response");
  if (signals.lastUserMessageAt && now.getTime() - signals.lastUserMessageAt.getTime() < 5 * 60_000) reasons.push("recent_conversation");
  if (signals.minutesSinceLastIntervention != null && signals.minutesSinceLastIntervention < Math.max(120, signals.interventionCooldownMinutes)) reasons.push("cooldown_active");
  return reasons;
}
