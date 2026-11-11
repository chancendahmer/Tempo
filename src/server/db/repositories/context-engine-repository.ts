import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { ContextEngineRepository } from "../../domain/context-evaluation-service";
import { ContextPolicy, ContextSignals, DEFAULT_CONTEXT_POLICY, LINKED_THOUGHT_WINDOW_MS, WORKSPACE_ACTIVITY_WINDOW_MS, WorkspaceContext, contextSettingsSchema, contextWeightsSchema, evaluateContext, localTime, proactiveBlockReasons } from "../../domain/context-engine";
import { getDatabase, TempoDatabase } from "../client";
import {
  calendarBusyWindows,
  calendarConnections,
  consentRecords,
  conversationMessages,
  contextSnapshots,
  extensionSignalSnapshots,
  interventionOutcomes,
  interventionPolicies,
  interventions,
  itemReviews,
  lifeItems,
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

  async loadSignals(userId: string, now: Date, exclusions: { interventionId?: string; reviewId?: string } = {}) {
    const [user] = await this.database.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;
    const contactAt = sql<Date>`coalesce(${interventions.sentAt}, ${interventions.queuedAt}, ${interventions.createdAt})`.mapWith(interventions.createdAt);
    const otherIntervention = exclusions.interventionId ? ne(interventions.id, exclusions.interventionId) : undefined;
    const contactSince = new Date(now.getTime() - Math.max(36 * 60, user.interventionCooldownMinutes) * 60_000);
    const [latestConsent, openTasks, calendar, recentInterventions, pending, learningMemories, extensionSignals, latestInbound, reviews] = await Promise.all([
      this.database.select({ status: consentRecords.status }).from(consentRecords)
        .where(eq(consentRecords.userId, userId)).orderBy(desc(consentRecords.createdAt), desc(consentRecords.id)).limit(1),
      this.database.select({
        id: tasks.id, title: tasks.title, status: tasks.status, dueAt: tasks.dueAt,
        estimatedMinutes: tasks.estimatedMinutes, createdAt: tasks.createdAt, startedAt: tasks.startedAt,
      }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.status, ["not_started", "in_progress"]))),
      this.loadCalendarContext(userId, now),
      this.database.select({
        at: contactAt,
        status: interventions.status,
        style: interventions.style,
        startedAt: interventionOutcomes.startedAt,
      }).from(interventions)
        .leftJoin(interventionOutcomes, eq(interventionOutcomes.interventionId, interventions.id))
        .where(and(eq(interventions.userId, userId), gte(contactAt, contactSince), otherIntervention))
        .orderBy(desc(contactAt)),
      this.database.select({ id: interventions.id }).from(interventions)
        .leftJoin(interventionOutcomes, eq(interventionOutcomes.interventionId, interventions.id))
        .where(and(
          eq(interventions.userId, userId),
          inArray(interventions.status, ["queued", "sent", "delivered"]),
          gte(contactAt, new Date(now.getTime() - 24 * 3_600_000)),
          isNull(interventionOutcomes.id),
          otherIntervention,
      )).limit(1),
      this.database.select({ content: memoryEntries.content }).from(memoryEntries).where(and(
        eq(memoryEntries.userId, userId),
        eq(memoryEntries.category, "intervention_learning"),
        isNull(memoryEntries.deletedAt),
      )).limit(10),
      this.database.select({
        extensionKey: extensionSignalSnapshots.extensionKey,
        signalType: extensionSignalSnapshots.signalType,
        payload: extensionSignalSnapshots.payload,
        confidence: extensionSignalSnapshots.confidence,
      }).from(extensionSignalSnapshots).where(and(
        eq(extensionSignalSnapshots.userId, userId),
        lte(extensionSignalSnapshots.observedAt, now),
        gt(extensionSignalSnapshots.validUntil, now),
      )),
      this.database.select({ createdAt: conversationMessages.createdAt }).from(conversationMessages)
        .where(and(eq(conversationMessages.userId, userId), eq(conversationMessages.direction, "inbound")))
        .orderBy(desc(conversationMessages.createdAt)).limit(1),
      this.loadReviewContacts(userId, contactSince, exclusions.reviewId),
    ]);

    const contactStatuses = new Set(["queued", "sent", "delivered", "responded", "expired"]);
    const contactInterventions = recentInterventions.filter((item) => contactStatuses.has(item.status));
    const contacts = [...contactInterventions, ...reviews].sort((a, b) => b.at.getTime() - a.at.getTime());
    const lastIntervention = contacts[0]?.at;
    const local = localTime(now, user.timezone);
    const responseStats = user.responseStats as { byTimeBucket?: Record<string, number> };
    const bucketRate = responseStats.byTimeBucket?.[local.bucket];
    const lastSyncedAt = calendar?.lastSyncedAt;
    const syncAge = lastSyncedAt ? now.getTime() - lastSyncedAt.getTime() : Number.POSITIVE_INFINITY;
    const calendarAvailable = syncAge >= 0 && syncAge <= 45 * 60_000;
    const calendarBusy = calendarAvailable && Boolean(calendar?.currentBusyId);
    const freeMinutes = !calendarAvailable ? 0 : calendarBusy ? 0 : Math.max(0, Math.min(240,
      calendar?.nextBusyStart ? Math.floor((calendar.nextBusyStart.getTime() - now.getTime()) / 60_000) : 240,
    ));

    const signals: ContextSignals = {
      userId,
      status: user.status,
      onboardingComplete: user.onboardingState === "complete",
      hasConsent: latestConsent[0]?.status === "granted",
      proactiveOptIn: user.proactiveOptIn,
      timezone: user.timezone,
      quietHoursStart: user.quietHoursStart,
      quietHoursEnd: user.quietHoursEnd,
      pausedUntil: user.pausedUntil,
      calendarBusy,
      calendarAvailable,
      freeMinutes,
      nextFreeAt: calendarAvailable ? calendar?.nextBusyEnd ?? null : null,
      dailyInterventionCount: contacts.filter((item) => localTime(item.at, user.timezone).date === local.date).length,
      dailyInterventionCap: user.dailyInterventionCap,
      minutesSinceLastIntervention: lastIntervention ? Math.floor((now.getTime() - lastIntervention.getTime()) / 60_000) : null,
      interventionCooldownMinutes: user.interventionCooldownMinutes,
      hasPendingResponse: pending.length > 0 || reviews.some(row => row.status !== "closed" && now.getTime() - row.at.getTime() < 24 * 3_600_000),
      lastUserMessageAt: latestInbound[0]?.createdAt ?? null,
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
      tasks: openTasks.map(({ id, title, status, dueAt, estimatedMinutes, createdAt }) => ({
        id, title, status: status as "not_started" | "in_progress", dueAt, estimatedMinutes, createdAt,
      })),
    };
    if (!proactiveBlockReasons(signals, now).length) {
      signals.workspace = await this.loadWorkspaceContext(userId, local.date, now, openTasks);
    }
    return signals;
  }

  async loadReviewContacts(userId: string, since: Date, excludeReviewId?: string) {
    // An older reservation counts at submission time as soon as provider I/O can begin.
    const at = sql<Date>`coalesce(${itemReviews.sentAt}, ${conversationMessages.submissionStartedAt}, ${itemReviews.createdAt})`.mapWith(itemReviews.createdAt);
    return this.database.select({ at, status: itemReviews.status }).from(itemReviews)
      .leftJoin(conversationMessages, and(
        eq(conversationMessages.userId, itemReviews.userId),
        eq(conversationMessages.idempotencyKey, sql`'item-review:' || ${itemReviews.id}::text`),
        inArray(conversationMessages.outboundState, ["submitting", "accepted", "ambiguous"]),
      )).where(and(
        eq(itemReviews.userId, userId),
        inArray(itemReviews.status, ["reserved", "sent", "closed"]),
        gte(at, since),
        excludeReviewId ? ne(itemReviews.id, excludeReviewId) : undefined,
      ));
  }

  async evaluateDelivery(userId: string, interventionId: string, now: Date) {
    const [policy, signals] = await Promise.all([
      this.getActivePolicy(),
      this.loadSignals(userId, now, { interventionId }),
    ]);
    return signals && { signals, evaluation: evaluateContext({ signals, policy, now, shadowMode: false }) };
  }

  private async loadCalendarContext(userId: string, now: Date) {
    const sameCalendar = and(
      eq(calendarBusyWindows.connectionId, calendarConnections.id),
      eq(calendarBusyWindows.userId, userId),
    );
    const currentBusy = this.database.select({ id: calendarBusyWindows.id }).from(calendarBusyWindows)
      .where(and(sameCalendar, lte(calendarBusyWindows.startsAt, now), gt(calendarBusyWindows.endsAt, now))).limit(1).as("current_busy");
    const nextBusy = this.database.select({ startsAt: calendarBusyWindows.startsAt, endsAt: calendarBusyWindows.endsAt }).from(calendarBusyWindows)
      .where(and(sameCalendar, gt(calendarBusyWindows.startsAt, now)))
      .orderBy(calendarBusyWindows.startsAt).limit(1).as("next_busy");
    // Read freshness and windows in one statement so a refresh cannot mix sync generations.
    const [calendar] = await this.database.select({
      lastSyncedAt: calendarConnections.lastSyncedAt,
      currentBusyId: currentBusy.id,
      nextBusyStart: nextBusy.startsAt,
      nextBusyEnd: nextBusy.endsAt,
    }).from(calendarConnections).leftJoinLateral(currentBusy, sql`true`).leftJoinLateral(nextBusy, sql`true`).where(and(
      eq(calendarConnections.userId, userId), eq(calendarConnections.status, "active"),
    )).limit(1);
    return calendar;
  }

  private async loadWorkspaceContext(
    userId: string,
    date: string,
    now: Date,
    openTasks: readonly Pick<typeof tasks.$inferSelect, "status" | "startedAt" | "estimatedMinutes">[],
  ): Promise<WorkspaceContext> {
    const kind = sql<string>`${lifeItems.data}->>'kind'`;
    const day = sql<string>`${lifeItems.data}->>'date'`;
    const taskId = sql<string | null>`${lifeItems.data}->>'taskId'`;
    const activitySince = new Date(now.getTime() - WORKSPACE_ACTIVITY_WINDOW_MS);
    const datedActivity = and(inArray(kind, ["meal", "food", "workout"]), eq(day, date));
    const otherActivity = inArray(kind, ["note", "nutrition_target", "workout_plan"]);
    const [plans, [activity], thoughts] = await Promise.all([
      this.database.select({
        kind,
        endsAt: sql<string | null>`${lifeItems.data}->>'endsAt'`,
        time: sql<string | null>`${lifeItems.data}->>'time'`,
        steps: sql<WorkspaceContext["routines"][number]["steps"] | null>`${lifeItems.data}->'steps'`,
      }).from(lifeItems).where(and(eq(lifeItems.userId, userId), inArray(kind, ["focus", "routine"]), lte(lifeItems.updatedAt, now))),
      this.database.select({ updatedAt: lifeItems.updatedAt }).from(lifeItems).where(and(
        eq(lifeItems.userId, userId), gt(lifeItems.updatedAt, activitySince), lte(lifeItems.updatedAt, now), or(datedActivity, otherActivity),
      )).orderBy(desc(lifeItems.updatedAt)).limit(1),
      this.database.select({ taskId, updatedAt: sql<Date>`max(${lifeItems.updatedAt})`.mapWith(lifeItems.updatedAt) }).from(lifeItems).where(and(
        eq(lifeItems.userId, userId), eq(kind, "note"), isNotNull(taskId),
        gt(lifeItems.updatedAt, new Date(now.getTime() - LINKED_THOUGHT_WINDOW_MS)), lte(lifeItems.updatedAt, now),
      )).groupBy(taskId),
    ]);
    const focus = plans.find(plan => plan.kind === "focus");
    let focusUntil = focus?.endsAt ? new Date(focus.endsAt) : null;
    // The workspace displays a timer for tasks started over text or chat.
    // A saved timer, including a paused one, takes precedence over that fallback.
    if (!focus) {
      for (const task of openTasks) {
        if (task.status !== "in_progress" || !task.startedAt || task.startedAt > now) continue;
        const endsAt = new Date(task.startedAt.getTime() + (task.estimatedMinutes ?? 25) * 60_000);
        if (endsAt > now && (!focusUntil || endsAt > focusUntil)) focusUntil = endsAt;
      }
    }
    const linkedThoughts = new Map<string, Date>();
    for (const thought of thoughts) {
      if (thought.taskId) linkedThoughts.set(thought.taskId, thought.updatedAt);
    }
    return {
      focusUntil,
      routines: plans.flatMap(plan => plan.kind === "routine" && plan.time && Array.isArray(plan.steps) ? [{
        time: plan.time,
        steps: plan.steps.filter(step => step && Number.isInteger(step.minutes) && step.minutes >= 1 && step.minutes <= 180)
          .map(({ minutes, completedOn }) => ({ minutes, completedOn })),
      }] : []),
      latestActivityAt: activity?.updatedAt ?? null,
      linkedThoughts,
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

  async completeReview(snapshotId: string, userId: string, evaluation: Parameters<ContextEngineRepository["completeReview"]>[2]) {
    const [updated] = await this.database.update(contextSnapshots).set({
      decision: evaluation.decision,
      reasonCodes: evaluation.reasonCodes,
      inputs: evaluation.inputs,
    }).where(and(
      eq(contextSnapshots.id, snapshotId), eq(contextSnapshots.userId, userId),
      eq(contextSnapshots.decision, "blocked"), sql`'ai_review_pending' = any(${contextSnapshots.reasonCodes})`,
    )).returning({ id: contextSnapshots.id });
    if (!updated) throw new Error("Intervention review has no pending snapshot");
  }
}
