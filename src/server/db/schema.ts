import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const userStatus = pgEnum("user_status", ["active", "paused", "opted_out", "deleted"]);
export const onboardingState = pgEnum("onboarding_state", [
  "awaiting_consent",
  "introduction",
  "timezone",
  "quiet_hours",
  "coaching_style",
  "first_task",
  "calendar",
  "complete",
]);
export const consentStatus = pgEnum("consent_status", ["granted", "revoked"]);
export const consentChannel = pgEnum("consent_channel", ["web", "sms", "admin"]);
export const goalStatus = pgEnum("goal_status", ["active", "completed", "abandoned"]);
export const taskStatus = pgEnum("task_status", ["not_started", "in_progress", "completed", "abandoned"]);
export const messageDirection = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageStatus = pgEnum("message_status", [
  "received",
  "queued",
  "processing",
  "processed",
  "sent",
  "delivered",
  "cancelled",
  "failed",
  "undelivered",
]);
export const messageKind = pgEnum("message_kind", ["user", "coach", "system", "compliance"]);
export const messagingProvider = pgEnum("messaging_provider", ["sendblue", "linq", "twilio", "test"]);
export const messagingService = pgEnum("messaging_service", ["iMessage", "RCS", "SMS"]);
export const calendarConnectionStatus = pgEnum("calendar_connection_status", [
  "active",
  "requires_reauth",
  "disconnected",
]);
export const contextDecision = pgEnum("context_decision", ["blocked", "shadow", "holdout", "send"]);
export const interventionStyle = pgEnum("intervention_style", [
  "micro_start",
  "direct_nudge",
  "task_breakdown",
  "body_doubling",
  "reschedule",
]);
export const interventionStatus = pgEnum("intervention_status", [
  "candidate",
  "shadowed",
  "held_out",
  "queued",
  "sent",
  "delivered",
  "failed",
  "responded",
  "cancelled",
  "expired",
]);
export const outcomeSource = pgEnum("outcome_source", [
  "explicit_reply",
  "task_status_change",
  "timeout",
]);
export const memoryCategory = pgEnum("memory_category", [
  "preference",
  "pattern",
  "fact",
  "intervention_learning",
]);
export const memorySensitivity = pgEnum("memory_sensitivity", ["normal", "sensitive"]);
export const coachingTone = pgEnum("coaching_tone", ["gentle", "balanced", "direct"]);
export const taskEventType = pgEnum("task_event_type", ["created", "updated", "started", "completed", "abandoned"]);
export const goalEventType = pgEnum("goal_event_type", ["created", "updated", "completed", "abandoned"]);
export const scheduledActionStatus = pgEnum("scheduled_action_status", [
  "scheduled",
  "running",
  "completed",
  "cancelled",
  "failed",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneE164: text("phone_e164").notNull(),
    displayName: text("display_name"),
    profileInstructions: text("profile_instructions"),
    profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
    locale: text("locale").default("en-US").notNull(),
    timezone: text("timezone").default("UTC").notNull(),
    status: userStatus("status").default("active").notNull(),
    onboardingState: onboardingState("onboarding_state").default("awaiting_consent").notNull(),
    quietHoursStart: time("quiet_hours_start"),
    quietHoursEnd: time("quiet_hours_end"),
    preferredCoachingStyle: interventionStyle("preferred_coaching_style"),
    coachingTone: coachingTone("coaching_tone").default("balanced").notNull(),
    dailyInterventionCap: integer("daily_intervention_cap").default(3).notNull(),
    interventionCooldownMinutes: integer("intervention_cooldown_minutes").default(240).notNull(),
    pausedUntil: timestamp("paused_until", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),
    responseStats: jsonb("response_stats").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_phone_e164_unique").on(table.phoneE164),
    index("users_status_idx").on(table.status),
    check("users_phone_e164_check", sql`${table.phoneE164} ~ '^\\+[1-9][0-9]{7,14}$'`),
    check("users_daily_intervention_cap_check", sql`${table.dailyInterventionCap} between 0 and 10`),
    check("users_cooldown_minutes_check", sql`${table.interventionCooldownMinutes} >= 0`),
  ],
);

export const webSessions = pgTable(
  "web_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("web_sessions_token_hash_unique").on(table.tokenHash),
    index("web_sessions_user_idx").on(table.userId),
    index("web_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: consentStatus("status").notNull(),
    channel: consentChannel("channel").notNull(),
    disclosureVersion: text("disclosure_version").notNull(),
    termsVersion: text("terms_version").notNull(),
    privacyVersion: text("privacy_version").notNull(),
    sourceIpHash: text("source_ip_hash"),
    userAgent: text("user_agent"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("consent_records_user_created_idx").on(table.userId, table.createdAt)],
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: messagingProvider("provider"),
    providerService: messagingService("provider_service"),
    providerMessageSid: text("provider_message_sid"),
    idempotencyKey: text("idempotency_key"),
    direction: messageDirection("direction").notNull(),
    kind: messageKind("kind").notNull(),
    status: messageStatus("status").notNull(),
    body: text("body").notNull(),
    relatedInterventionId: uuid("related_intervention_id"),
    providerErrorCode: text("provider_error_code"),
    providerErrorMessage: text("provider_error_message"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("conversation_messages_provider_message_unique").on(table.provider, table.providerMessageSid),
    uniqueIndex("conversation_messages_idempotency_key_unique").on(table.idempotencyKey),
    index("conversation_messages_user_created_idx").on(table.userId, table.createdAt),
    index("conversation_messages_status_idx").on(table.status),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: goalStatus("status").default("active").notNull(),
    sourceMessageId: uuid("source_message_id").references(() => conversationMessages.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("goals_user_status_idx").on(table.userId, table.status),
    uniqueIndex("goals_source_message_unique").on(table.sourceMessageId),
  ],
);

export const goalEvents = pgTable(
  "goal_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
    sourceMessageId: uuid("source_message_id").notNull().references(() => conversationMessages.id, { onDelete: "restrict" }),
    eventType: goalEventType("event_type").notNull(),
    changes: jsonb("changes").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("goal_events_goal_created_idx").on(table.goalId, table.createdAt),
    index("goal_events_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("goal_events_source_message_unique").on(table.sourceMessageId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    notes: text("notes"),
    estimatedMinutes: integer("estimated_minutes"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: taskStatus("status").default("not_started").notNull(),
    sourceMessageId: uuid("source_message_id").references(() => conversationMessages.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("tasks_user_status_due_idx").on(table.userId, table.status, table.dueAt),
    index("tasks_goal_idx").on(table.goalId),
    uniqueIndex("tasks_source_message_unique").on(table.sourceMessageId),
    check(
      "tasks_estimated_minutes_check",
      sql`${table.estimatedMinutes} is null or ${table.estimatedMinutes} between 1 and 1440`,
    ),
  ],
);

export const taskEvents = pgTable(
  "task_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    sourceMessageId: uuid("source_message_id").notNull().references(() => conversationMessages.id, { onDelete: "restrict" }),
    eventType: taskEventType("event_type").notNull(),
    changes: jsonb("changes").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("task_events_task_created_idx").on(table.taskId, table.createdAt),
    index("task_events_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("task_events_source_message_unique").on(table.sourceMessageId),
  ],
);

export const conversationStates = pgTable(
  "conversation_states",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    pendingAction: jsonb("pending_action").$type<Record<string, unknown>>(),
    pendingActionExpiresAt: timestamp("pending_action_expires_at", { withTimezone: true }),
    lastProcessedMessageId: uuid("last_processed_message_id").references(() => conversationMessages.id, { onDelete: "set null" }),
    ...timestamps,
  },
);

export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: text("scopes").array().default(sql`ARRAY[]::text[]`).notNull(),
    status: calendarConnectionStatus("status").default("active").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("calendar_connections_user_unique").on(table.userId)],
);

export const calendarBusyWindows = pgTable(
  "calendar_busy_windows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => calendarConnections.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    sourceHash: text("source_hash").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("calendar_busy_windows_source_unique").on(table.connectionId, table.sourceHash),
    index("calendar_busy_windows_user_range_idx").on(table.userId, table.startsAt, table.endsAt),
    check("calendar_busy_windows_range_check", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export const oauthStates = pgTable(
  "oauth_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    stateHash: text("state_hash").notNull(),
    codeVerifierEncrypted: text("code_verifier_encrypted"),
    redirectAfter: text("redirect_after"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("oauth_states_hash_unique").on(table.stateHash), index("oauth_states_expiry_idx").on(table.expiresAt)],
);

export const interventionPolicies = pgTable(
  "intervention_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    version: text("version").notNull(),
    active: boolean("active").default(false).notNull(),
    threshold: doublePrecision("threshold").notNull(),
    holdoutBasisPoints: integer("holdout_basis_points").default(1000).notNull(),
    weights: jsonb("weights").$type<Record<string, number>>().notNull(),
    settings: jsonb("settings").$type<Record<string, number | boolean | string>>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("intervention_policies_version_unique").on(table.version),
    uniqueIndex("intervention_policies_one_active_unique").on(table.active).where(sql`${table.active} = true`),
    check("intervention_policies_holdout_check", sql`${table.holdoutBasisPoints} between 0 and 10000`),
  ],
);

export const contextSnapshots = pgTable(
  "context_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    policyId: uuid("policy_id").references(() => interventionPolicies.id, { onDelete: "set null" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
    opportunityKey: text("opportunity_key"),
    decision: contextDecision("decision").notNull(),
    score: doublePrecision("score"),
    reasonCodes: text("reason_codes").array().default(sql`ARRAY[]::text[]`).notNull(),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull(),
    scoreBreakdown: jsonb("score_breakdown").$type<Record<string, number>>().default(sql`'{}'::jsonb`).notNull(),
    randomizedBucket: integer("randomized_bucket"),
  },
  (table) => [
    index("context_snapshots_user_captured_idx").on(table.userId, table.capturedAt),
    uniqueIndex("context_snapshots_opportunity_unique").on(table.opportunityKey),
    check(
      "context_snapshots_bucket_check",
      sql`${table.randomizedBucket} is null or ${table.randomizedBucket} between 0 and 9999`,
    ),
  ],
);

export const interventions = pgTable(
  "interventions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    contextSnapshotId: uuid("context_snapshot_id").notNull().references(() => contextSnapshots.id, { onDelete: "restrict" }),
    style: interventionStyle("style").notNull(),
    status: interventionStatus("status").default("candidate").notNull(),
    messageText: text("message_text"),
    idempotencyKey: text("idempotency_key").notNull(),
    provider: messagingProvider("provider"),
    providerMessageSid: text("provider_message_sid"),
    promptVersion: text("prompt_version"),
    model: text("model"),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("interventions_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("interventions_provider_message_unique").on(table.provider, table.providerMessageSid),
    index("interventions_user_status_idx").on(table.userId, table.status),
  ],
);

export const interventionOutcomes = pgTable(
  "intervention_outcomes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    interventionId: uuid("intervention_id").notNull().references(() => interventions.id, { onDelete: "cascade" }),
    sourceMessageId: uuid("source_message_id").references(() => conversationMessages.id, { onDelete: "set null" }),
    source: outcomeSource("source").notNull(),
    userResponse: text("user_response"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    helpful: boolean("helpful"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("intervention_outcomes_intervention_unique").on(table.interventionId)],
);

export const memoryEntries = pgTable(
  "memory_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    category: memoryCategory("category").notNull(),
    sensitivity: memorySensitivity("sensitivity").default("normal").notNull(),
    content: text("content").notNull(),
    confidence: doublePrecision("confidence"),
    sourceMessageId: uuid("source_message_id").references(() => conversationMessages.id, { onDelete: "set null" }),
    evidenceCount: integer("evidence_count").default(1).notNull(),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
    lastReferencedAt: timestamp("last_referenced_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    supersededById: uuid("superseded_by_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("memory_entries_user_category_idx").on(table.userId, table.category),
    check("memory_entries_confidence_check", sql`${table.confidence} is null or ${table.confidence} between 0 and 1`),
    check("memory_entries_evidence_count_check", sql`${table.evidenceCount} >= 1`),
  ],
);

export const scheduledActions = pgTable(
  "scheduled_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    interventionId: uuid("intervention_id").references(() => interventions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    queueJobId: text("queue_job_id"),
    status: scheduledActionStatus("status").default("scheduled").notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("scheduled_actions_idempotency_key_unique").on(table.idempotencyKey),
    index("scheduled_actions_status_run_idx").on(table.status, table.runAt),
    check("scheduled_actions_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export const serviceHeartbeats = pgTable("service_heartbeats", {
  serviceKey: text("service_key").primaryKey(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").default(1).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("rate_limit_buckets_key_window_unique").on(table.key, table.windowStart),
    index("rate_limit_buckets_window_idx").on(table.windowStart),
    check("rate_limit_buckets_count_check", sql`${table.count} >= 1`),
  ],
);
