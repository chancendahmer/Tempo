import { and, desc, eq, gt, gte, inArray, isNull, lte } from "drizzle-orm";
import { ContextEngineRepository } from "../../domain/context-evaluation-service";
import { ContextPolicy, DEFAULT_CONTEXT_POLICY, contextSettingsSchema, contextWeightsSchema, localTime } from "../../domain/context-engine";
import { getDatabase, TempoDatabase } from "../client";
import {
  calendarBusyWindows,
  calendarConnections,
  consentRecords,
  contextSnapshots,
  extensionSignalSnapshots,
  interventionOutcomes,
  interventionPolicies,
  interventions,
  memoryEntries,
  tasks,
  users,
} from "../schema";

export class DrizzleContextEngineRepository implements ContextEngineRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async getActivePolicy(): Promise<ContextPolicy> {
    let [policy] = await this.database.select().from(interventionPolicies).where(eq(interventionPolicies.active, true)).limit(1);
    if (!policy) {
      await this.database.insert(interventionPolicies).values({
        version: DEFAULT_CONTEXT_POLICY.version,
        active: true,
        threshold: DEFAULT_CONTEXT_POLICY.threshold,
        weights: DEFAULT_CONTEXT_POLICY.weights,
        settings: DEFAULT_CONTEXT_POLICY.settings,
      }).onConflictDoNothing({ target: interventionPolicies.version });
      [policy] = await this.database.select().from(interventionPolicies).where(eq(interventionPolicies.active, true)).limit(1);
    }
    if (!policy) throw new Error("No active intervention policy is configured");
    return {
      id: policy.id,
      version: policy.version,
      threshold: policy.threshold,
      holdoutBasisPoints: policy.holdoutBasisPoints,
      weights: contextWeightsSchema.parse(policy.weights),
      settings: contextSettingsSchema.parse(policy.settings),
    };
  }

  async loadSignals(userId: string, now: Date) {
    const [user] = await this.database.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;
    const [latestConsent, openTasks, currentBusy, nextBusy, recentInterventions, pending, learningMemories, calendarConnection, extensionSignals] = await Promise.all([
      this.database.select({ status: consentRecords.status }).from(consentRecords)
        .where(eq(consentRecords.userId, userId)).orderBy(desc(consentRecords.createdAt)).limit(1),
      this.database.select({
        id: tasks.id, title: tasks.title, status: tasks.status, dueAt: tasks.dueAt,
        estimatedMinutes: tasks.estimatedMinutes, createdAt: tasks.createdAt,
      }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.status, ["not_started", "in_progress"]))),
      this.database.select({ id: calendarBusyWindows.id }).from(calendarBusyWindows)
        .where(and(eq(calendarBusyWindows.userId, userId), lte(calendarBusyWindows.startsAt, now), gt(calendarBusyWindows.endsAt, now))).limit(1),
      this.database.select({ startsAt: calendarBusyWindows.startsAt, endsAt: calendarBusyWindows.endsAt }).from(calendarBusyWindows)
        .where(and(eq(calendarBusyWindows.userId, userId), gt(calendarBusyWindows.startsAt, now)))
        .orderBy(calendarBusyWindows.startsAt).limit(1),
      this.database.select({
        createdAt: interventions.createdAt,
        status: interventions.status,
        style: interventions.style,
        startedAt: interventionOutcomes.startedAt,
      }).from(interventions)
        .leftJoin(interventionOutcomes, eq(interventionOutcomes.interventionId, interventions.id))
        .where(and(eq(interventions.userId, userId), gte(interventions.createdAt, new Date(now.getTime() - 36 * 3_600_000))))
        .orderBy(desc(interventions.createdAt)),
      this.database.select({ id: interventions.id }).from(interventions)
        .leftJoin(interventionOutcomes, eq(interventionOutcomes.interventionId, interventions.id))
        .where(and(
          eq(interventions.userId, userId),
          inArray(interventions.status, ["queued", "sent", "delivered"]),
          gte(interventions.createdAt, new Date(now.getTime() - 24 * 3_600_000)),
          isNull(interventionOutcomes.id),
      )).limit(1),
      this.database.select({ content: memoryEntries.content }).from(memoryEntries).where(and(
        eq(memoryEntries.userId, userId),
        eq(memoryEntries.category, "intervention_learning"),
        isNull(memoryEntries.deletedAt),
      )).limit(10),
      this.database.select({ lastSyncedAt: calendarConnections.lastSyncedAt }).from(calendarConnections).where(and(
        eq(calendarConnections.userId, userId),
        eq(calendarConnections.status, "active"),
      )).limit(1),
      this.database.select({
        extensionKey: extensionSignalSnapshots.extensionKey,
        signalType: extensionSignalSnapshots.signalType,
        payload: extensionSignalSnapshots.payload,
        confidence: extensionSignalSnapshots.confidence,
      }).from(extensionSignalSnapshots).where(and(
        eq(extensionSignalSnapshots.userId, userId),
        gt(extensionSignalSnapshots.validUntil, now),
      )),
    ]);

    const contactStatuses = new Set(["queued", "sent", "delivered", "responded", "expired"]);
    const contactInterventions = recentInterventions.filter((item) => contactStatuses.has(item.status));
    const lastIntervention = contactInterventions[0]?.createdAt;
    const local = localTime(now, user.timezone);
    const responseStats = user.responseStats as { byTimeBucket?: Record<string, number> };
    const bucketRate = responseStats.byTimeBucket?.[local.bucket];
    const calendarAvailable = Boolean(
      calendarConnection[0]?.lastSyncedAt &&
      now.getTime() - calendarConnection[0].lastSyncedAt.getTime() <= 45 * 60_000,
    );
    const calendarBusy = calendarAvailable && currentBusy.length > 0;
    const freeMinutes = !calendarAvailable ? 0 : calendarBusy ? 0 : Math.max(0, Math.min(240,
      nextBusy[0] ? Math.floor((nextBusy[0].startsAt.getTime() - now.getTime()) / 60_000) : 240,
    ));

    return {
      userId,
      status: user.status,
      onboardingComplete: user.onboardingState === "complete",
      hasConsent: latestConsent[0]?.status === "granted",
      timezone: user.timezone,
      quietHoursStart: user.quietHoursStart,
      quietHoursEnd: user.quietHoursEnd,
      pausedUntil: user.pausedUntil,
      calendarBusy,
      calendarAvailable,
      freeMinutes,
      nextFreeAt: calendarAvailable ? nextBusy[0]?.endsAt ?? null : null,
      dailyInterventionCount: contactInterventions.filter((item) => localTime(item.createdAt, user.timezone).date === local.date).length,
      dailyInterventionCap: user.dailyInterventionCap,
      minutesSinceLastIntervention: lastIntervention ? Math.floor((now.getTime() - lastIntervention.getTime()) / 60_000) : null,
      interventionCooldownMinutes: user.interventionCooldownMinutes,
      hasPendingResponse: pending.length > 0,
      responseRate: typeof bucketRate === "number" ? bucketRate : 0.5,
      coachingTone: user.coachingTone,
      preferredCoachingStyle: user.preferredCoachingStyle,
      repeatedNonStarts: recentInterventions.filter((item) =>
        (item.status === "responded" || item.status === "expired") && !item.startedAt,
      ).slice(0, 3).length,
      bodyDoublingAffinity: learningMemories.some((memory) =>
        memory.content.toLowerCase().startsWith("body doubling nudges have usually helped"),
      ),
      extensionSignals,
      tasks: openTasks.map((task) => ({
        ...task,
        status: task.status as "not_started" | "in_progress",
      })),
    };
  }

  async saveSnapshot(input: Parameters<ContextEngineRepository["saveSnapshot"]>[0]) {
    const [created] = await this.database.insert(contextSnapshots).values({
      userId: input.userId,
      taskId: input.taskId,
      policyId: input.policyId,
      capturedAt: input.capturedAt,
      opportunityKey: input.evaluation.opportunityKey,
      decision: input.evaluation.decision,
      score: input.evaluation.score,
      reasonCodes: input.evaluation.reasonCodes,
      inputs: input.evaluation.inputs,
      scoreBreakdown: input.evaluation.scoreBreakdown,
      randomizedBucket: input.evaluation.randomizedBucket,
    }).onConflictDoNothing({ target: contextSnapshots.opportunityKey }).returning({ id: contextSnapshots.id });
    if (created) return { id: created.id, created: true };
    const [existing] = await this.database.select({ id: contextSnapshots.id }).from(contextSnapshots)
      .where(eq(contextSnapshots.opportunityKey, input.evaluation.opportunityKey)).limit(1);
    if (!existing) throw new Error("Context opportunity idempotency conflict could not be resolved");
    return { id: existing.id, created: false };
  }
}
