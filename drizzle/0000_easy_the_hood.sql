CREATE TYPE "public"."calendar_connection_status" AS ENUM('active', 'requires_reauth', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."consent_channel" AS ENUM('web', 'sms', 'admin');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('granted', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."context_decision" AS ENUM('blocked', 'shadow', 'holdout', 'send');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."intervention_status" AS ENUM('candidate', 'shadowed', 'held_out', 'queued', 'sent', 'delivered', 'failed', 'responded', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."intervention_style" AS ENUM('micro_start', 'direct_nudge', 'task_breakdown', 'body_doubling', 'reschedule');--> statement-breakpoint
CREATE TYPE "public"."memory_category" AS ENUM('preference', 'pattern', 'fact', 'intervention_learning');--> statement-breakpoint
CREATE TYPE "public"."memory_sensitivity" AS ENUM('normal', 'sensitive');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('user', 'coach', 'system', 'compliance');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('received', 'queued', 'processing', 'sent', 'delivered', 'failed', 'undelivered');--> statement-breakpoint
CREATE TYPE "public"."onboarding_state" AS ENUM('awaiting_consent', 'introduction', 'timezone', 'quiet_hours', 'coaching_style', 'first_task', 'calendar', 'complete');--> statement-breakpoint
CREATE TYPE "public"."outcome_source" AS ENUM('explicit_reply', 'task_status_change', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."scheduled_action_status" AS ENUM('scheduled', 'running', 'completed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('not_started', 'in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'paused', 'opted_out', 'deleted');--> statement-breakpoint
CREATE TABLE "calendar_busy_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"source_hash" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_account_id" text,
	"encrypted_access_token" text,
	"encrypted_refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "calendar_connection_status" DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "consent_status" NOT NULL,
	"channel" "consent_channel" NOT NULL,
	"disclosure_version" text NOT NULL,
	"terms_version" text NOT NULL,
	"privacy_version" text NOT NULL,
	"source_ip" text,
	"user_agent" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"policy_id" uuid,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decision" "context_decision" NOT NULL,
	"score" double precision,
	"reason_codes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"inputs" jsonb NOT NULL,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"randomized_bucket" integer
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_message_sid" text,
	"direction" "message_direction" NOT NULL,
	"kind" "message_kind" NOT NULL,
	"status" "message_status" NOT NULL,
	"body" text NOT NULL,
	"related_intervention_id" uuid,
	"provider_error_code" text,
	"provider_error_message" text,
	"received_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"source_message_id" uuid,
	"completed_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intervention_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intervention_id" uuid NOT NULL,
	"source_message_id" uuid,
	"source" "outcome_source" NOT NULL,
	"user_response" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"helpful" boolean,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intervention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"threshold" double precision NOT NULL,
	"holdout_basis_points" integer DEFAULT 1000 NOT NULL,
	"weights" jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interventions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"context_snapshot_id" uuid NOT NULL,
	"style" "intervention_style" NOT NULL,
	"status" "intervention_status" DEFAULT 'candidate' NOT NULL,
	"message_text" text,
	"idempotency_key" text NOT NULL,
	"provider_message_sid" text,
	"prompt_version" text,
	"model" text,
	"queued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "memory_category" NOT NULL,
	"sensitivity" "memory_sensitivity" DEFAULT 'normal' NOT NULL,
	"content" text NOT NULL,
	"confidence" double precision,
	"source_message_id" uuid,
	"evidence_count" integer DEFAULT 1 NOT NULL,
	"last_confirmed_at" timestamp with time zone,
	"last_referenced_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"state_hash" text NOT NULL,
	"code_verifier_encrypted" text,
	"redirect_after" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"intervention_id" uuid,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"queue_job_id" text,
	"status" "scheduled_action_status" DEFAULT 'scheduled' NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"estimated_minutes" integer,
	"due_at" timestamp with time zone,
	"status" "task_status" DEFAULT 'not_started' NOT NULL,
	"source_message_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"onboarding_state" "onboarding_state" DEFAULT 'awaiting_consent' NOT NULL,
	"quiet_hours_start" time,
	"quiet_hours_end" time,
	"preferred_coaching_style" "intervention_style",
	"daily_intervention_cap" integer DEFAULT 3 NOT NULL,
	"intervention_cooldown_minutes" integer DEFAULT 240 NOT NULL,
	"paused_until" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"response_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_busy_windows" ADD CONSTRAINT "calendar_busy_windows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_busy_windows" ADD CONSTRAINT "calendar_busy_windows_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_snapshots" ADD CONSTRAINT "context_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_snapshots" ADD CONSTRAINT "context_snapshots_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_snapshots" ADD CONSTRAINT "context_snapshots_policy_id_intervention_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."intervention_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_outcomes" ADD CONSTRAINT "intervention_outcomes_intervention_id_interventions_id_fk" FOREIGN KEY ("intervention_id") REFERENCES "public"."interventions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_outcomes" ADD CONSTRAINT "intervention_outcomes_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_context_snapshot_id_context_snapshots_id_fk" FOREIGN KEY ("context_snapshot_id") REFERENCES "public"."context_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_intervention_id_interventions_id_fk" FOREIGN KEY ("intervention_id") REFERENCES "public"."interventions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_busy_windows_source_unique" ON "calendar_busy_windows" USING btree ("connection_id","source_hash");--> statement-breakpoint
CREATE INDEX "calendar_busy_windows_user_range_idx" ON "calendar_busy_windows" USING btree ("user_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connections_user_unique" ON "calendar_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consent_records_user_created_idx" ON "consent_records" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "context_snapshots_user_captured_idx" ON "context_snapshots" USING btree ("user_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_provider_sid_unique" ON "conversation_messages" USING btree ("provider_message_sid");--> statement-breakpoint
CREATE INDEX "conversation_messages_user_created_idx" ON "conversation_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_status_idx" ON "conversation_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "goals_user_status_idx" ON "goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "intervention_outcomes_intervention_unique" ON "intervention_outcomes" USING btree ("intervention_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intervention_policies_version_unique" ON "intervention_policies" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "interventions_idempotency_key_unique" ON "interventions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "interventions_provider_sid_unique" ON "interventions" USING btree ("provider_message_sid");--> statement-breakpoint
CREATE INDEX "interventions_user_status_idx" ON "interventions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "memory_entries_user_category_idx" ON "memory_entries" USING btree ("user_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_states_hash_unique" ON "oauth_states" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "oauth_states_expiry_idx" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_actions_idempotency_key_unique" ON "scheduled_actions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "scheduled_actions_status_run_idx" ON "scheduled_actions" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "tasks_user_status_due_idx" ON "tasks" USING btree ("user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_goal_idx" ON "tasks" USING btree ("goal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_e164_unique" ON "users" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");