CREATE TYPE "public"."accountability_status" AS ENUM('awaiting_initial', 'snoozed', 'followup_due', 'followup_sent', 'started', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('scheduled', 'sending', 'sent', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "extension_signal_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"extension_key" text NOT NULL,
	"signal_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" double precision,
	"observed_at" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extension_signal_confidence_check" CHECK ("extension_signal_snapshots"."confidence" is null or "extension_signal_snapshots"."confidence" between 0 and 1),
	CONSTRAINT "extension_signal_validity_check" CHECK ("extension_signal_snapshots"."valid_until" > "extension_signal_snapshots"."observed_at")
);
--> statement-breakpoint
CREATE TABLE "intervention_accountability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intervention_id" uuid NOT NULL,
	"status" "accountability_status" DEFAULT 'awaiting_initial' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"initial_response_message_id" uuid,
	"followup_response_message_id" uuid,
	"initial_response_text" text,
	"followup_response_text" text,
	"last_prompt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"source_message_id" uuid,
	"text" text NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"status" "reminder_status" DEFAULT 'scheduled' NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider" "messaging_provider",
	"provider_message_sid" text,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "related_reminder_id" uuid;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN "reminder_id" uuid;--> statement-breakpoint
ALTER TABLE "extension_signal_snapshots" ADD CONSTRAINT "extension_signal_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_accountability" ADD CONSTRAINT "intervention_accountability_intervention_id_interventions_id_fk" FOREIGN KEY ("intervention_id") REFERENCES "public"."interventions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_accountability" ADD CONSTRAINT "intervention_accountability_initial_response_message_id_conversation_messages_id_fk" FOREIGN KEY ("initial_response_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_accountability" ADD CONSTRAINT "intervention_accountability_followup_response_message_id_conversation_messages_id_fk" FOREIGN KEY ("followup_response_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "extension_signal_latest_unique" ON "extension_signal_snapshots" USING btree ("user_id","extension_key","signal_type");--> statement-breakpoint
CREATE INDEX "extension_signal_user_valid_idx" ON "extension_signal_snapshots" USING btree ("user_id","valid_until");--> statement-breakpoint
CREATE UNIQUE INDEX "intervention_accountability_intervention_unique" ON "intervention_accountability" USING btree ("intervention_id");--> statement-breakpoint
CREATE INDEX "intervention_accountability_status_snooze_idx" ON "intervention_accountability" USING btree ("status","snoozed_until");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_idempotency_key_unique" ON "reminders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_source_message_unique" ON "reminders" USING btree ("source_message_id");--> statement-breakpoint
CREATE INDEX "reminders_user_status_time_idx" ON "reminders" USING btree ("user_id","status","remind_at");--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE cascade ON UPDATE no action;