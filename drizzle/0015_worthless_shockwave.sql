CREATE TYPE "public"."conversation_participant_role" AS ENUM('user', 'tempo', 'external');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'archived', 'closed');--> statement-breakpoint
CREATE TYPE "public"."conversation_type" AS ENUM('direct', 'group');--> statement-breakpoint
CREATE TYPE "public"."message_relation_type" AS ENUM('reply', 'thread', 'quote', 'reaction');--> statement-breakpoint
CREATE TYPE "public"."provider_resource_status" AS ENUM('active', 'disabled', 'porting');--> statement-breakpoint
CREATE TYPE "public"."user_identity_type" AS ENUM('phone', 'email', 'google');--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_identity_id" uuid,
	"role" "conversation_participant_role" NOT NULL,
	"display_name" text,
	"address" text,
	"normalized_address" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"provider_option_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_poll_options_position_check" CHECK ("conversation_poll_options"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "conversation_poll_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"responder_key" text NOT NULL,
	"provider_response_id" text,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"question" text NOT NULL,
	"allows_multiple" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"provider_poll_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"type" "conversation_type" DEFAULT 'direct' NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"title" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"agent_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"source_message_id" uuid NOT NULL,
	"target_message_id" uuid NOT NULL,
	"type" "message_relation_type" NOT NULL,
	"value" text,
	"provider_relation_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "messaging_provider" NOT NULL,
	"account_key" text DEFAULT 'default' NOT NULL,
	"external_account_id" text,
	"label" text,
	"status" "provider_resource_status" DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"provider_line_id" uuid,
	"provider" "messaging_provider" NOT NULL,
	"external_key" text NOT NULL,
	"provider_chat_id" text,
	"provider_thread_id" text,
	"service" "messaging_service",
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_account_id" uuid NOT NULL,
	"provider" "messaging_provider" NOT NULL,
	"address" text NOT NULL,
	"external_line_id" text,
	"label" text,
	"status" "provider_resource_status" DEFAULT 'active' NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_message_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"provider_conversation_id" uuid,
	"provider" "messaging_provider" NOT NULL,
	"external_message_id" text NOT NULL,
	"external_thread_id" text,
	"delivery_status" "message_status" NOT NULL,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "user_identity_type" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "content_parts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_states" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
INSERT INTO "user_identities" ("user_id", "type", "value", "normalized_value", "is_primary", "verified_at", "created_at", "updated_at")
SELECT "id", 'phone', "phone_e164", "phone_e164", true, "phone_verified_at", "created_at", "updated_at"
FROM "users"
;--> statement-breakpoint
INSERT INTO "conversations" ("owner_user_id", "type", "status", "is_primary", "last_message_at", "created_at", "updated_at")
SELECT
	"users"."id",
	'direct',
	'active',
	true,
	MAX("conversation_messages"."created_at"),
	"users"."created_at",
	GREATEST("users"."updated_at", COALESCE(MAX("conversation_messages"."created_at"), "users"."updated_at"))
FROM "users"
LEFT JOIN "conversation_messages" ON "conversation_messages"."user_id" = "users"."id"
GROUP BY "users"."id"
;--> statement-breakpoint
UPDATE "conversation_messages"
SET "conversation_id" = "conversations"."id"
FROM "conversations"
WHERE "conversations"."owner_user_id" = "conversation_messages"."user_id"
	AND "conversations"."type" = 'direct'
	AND "conversations"."is_primary" = true;--> statement-breakpoint
UPDATE "conversation_states"
SET "conversation_id" = "conversations"."id"
FROM "conversations"
WHERE "conversations"."owner_user_id" = "conversation_states"."user_id"
	AND "conversations"."type" = 'direct'
	AND "conversations"."is_primary" = true;--> statement-breakpoint
INSERT INTO "conversation_participants" ("conversation_id", "user_identity_id", "role", "display_name", "address", "normalized_address")
SELECT "conversations"."id", "user_identities"."id", 'user', "users"."display_name", "user_identities"."value", "user_identities"."normalized_value"
FROM "conversations"
JOIN "users" ON "users"."id" = "conversations"."owner_user_id"
JOIN "user_identities" ON "user_identities"."user_id" = "users"."id"
	AND "user_identities"."type" = 'phone'
	AND "user_identities"."is_primary" = true
WHERE "conversations"."type" = 'direct';--> statement-breakpoint
INSERT INTO "conversation_participants" ("conversation_id", "role", "display_name")
SELECT "id", 'tempo', 'Tempo'
FROM "conversations";--> statement-breakpoint
INSERT INTO "provider_accounts" ("provider", "account_key", "label")
SELECT DISTINCT "provider", 'default', 'Migrated default account'
FROM "conversation_messages"
WHERE "provider" IS NOT NULL;--> statement-breakpoint
INSERT INTO "provider_conversations" ("conversation_id", "provider", "external_key", "service", "last_synced_at", "metadata")
SELECT
	"conversations"."id",
	"conversation_messages"."provider",
	'legacy:' || "conversation_messages"."provider"::text || ':' || "conversation_messages"."user_id"::text,
	MAX("conversation_messages"."provider_service"::text)::"messaging_service",
	MAX("conversation_messages"."created_at"),
	'{"source":"migration","provider_chat_id_unavailable":true}'::jsonb
FROM "conversation_messages"
JOIN "conversations" ON "conversations"."owner_user_id" = "conversation_messages"."user_id"
	AND "conversations"."type" = 'direct'
	AND "conversations"."is_primary" = true
WHERE "conversation_messages"."provider" IS NOT NULL
GROUP BY "conversations"."id", "conversation_messages"."provider", "conversation_messages"."user_id";--> statement-breakpoint
INSERT INTO "provider_message_bindings" ("message_id", "provider_conversation_id", "provider", "external_message_id", "delivery_status", "raw_metadata", "created_at", "updated_at")
SELECT
	"conversation_messages"."id",
	"provider_conversations"."id",
	"conversation_messages"."provider",
	"conversation_messages"."provider_message_sid",
	"conversation_messages"."status",
	'{"source":"migration"}'::jsonb,
	"conversation_messages"."created_at",
	"conversation_messages"."updated_at"
FROM "conversation_messages"
JOIN "provider_conversations" ON "provider_conversations"."provider" = "conversation_messages"."provider"
	AND "provider_conversations"."external_key" = 'legacy:' || "conversation_messages"."provider"::text || ':' || "conversation_messages"."user_id"::text
WHERE "conversation_messages"."provider" IS NOT NULL
	AND "conversation_messages"."provider_message_sid" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_messages" ALTER COLUMN "conversation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_states" ALTER COLUMN "conversation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_identity_id_user_identities_id_fk" FOREIGN KEY ("user_identity_id") REFERENCES "public"."user_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_poll_options" ADD CONSTRAINT "conversation_poll_options_poll_id_conversation_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."conversation_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_poll_responses" ADD CONSTRAINT "conversation_poll_responses_poll_id_conversation_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."conversation_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_poll_responses" ADD CONSTRAINT "conversation_poll_responses_option_id_conversation_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."conversation_poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_polls" ADD CONSTRAINT "conversation_polls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_polls" ADD CONSTRAINT "conversation_polls_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_relations" ADD CONSTRAINT "message_relations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_relations" ADD CONSTRAINT "message_relations_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_relations" ADD CONSTRAINT "message_relations_target_message_id_conversation_messages_id_fk" FOREIGN KEY ("target_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_conversations" ADD CONSTRAINT "provider_conversations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_conversations" ADD CONSTRAINT "provider_conversations_provider_line_id_provider_lines_id_fk" FOREIGN KEY ("provider_line_id") REFERENCES "public"."provider_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_lines" ADD CONSTRAINT "provider_lines_provider_account_id_provider_accounts_id_fk" FOREIGN KEY ("provider_account_id") REFERENCES "public"."provider_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_message_bindings" ADD CONSTRAINT "provider_message_bindings_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_message_bindings" ADD CONSTRAINT "provider_message_bindings_provider_conversation_id_provider_conversations_id_fk" FOREIGN KEY ("provider_conversation_id") REFERENCES "public"."provider_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participants_identity_unique" ON "conversation_participants" USING btree ("conversation_id","user_identity_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_conversation_idx" ON "conversation_participants" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_poll_options_position_unique" ON "conversation_poll_options" USING btree ("poll_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_poll_responses_choice_unique" ON "conversation_poll_responses" USING btree ("poll_id","option_id","responder_key");--> statement-breakpoint
CREATE INDEX "conversation_polls_conversation_idx" ON "conversation_polls" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_primary_direct_unique" ON "conversations" USING btree ("owner_user_id") WHERE "conversations"."type" = 'direct' and "conversations"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "conversations_owner_status_idx" ON "conversations" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "message_relations_source_target_type_unique" ON "message_relations" USING btree ("source_message_id","target_message_id","type");--> statement-breakpoint
CREATE INDEX "message_relations_conversation_idx" ON "message_relations" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_accounts_provider_key_unique" ON "provider_accounts" USING btree ("provider","account_key");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_accounts_external_unique" ON "provider_accounts" USING btree ("provider","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_conversations_external_key_unique" ON "provider_conversations" USING btree ("provider","external_key");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_conversations_chat_unique" ON "provider_conversations" USING btree ("provider","provider_chat_id");--> statement-breakpoint
CREATE INDEX "provider_conversations_conversation_idx" ON "provider_conversations" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_lines_provider_address_unique" ON "provider_lines" USING btree ("provider","address");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_lines_external_unique" ON "provider_lines" USING btree ("provider","external_line_id");--> statement-breakpoint
CREATE INDEX "provider_lines_account_idx" ON "provider_lines" USING btree ("provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_message_bindings_external_unique" ON "provider_message_bindings" USING btree ("provider","external_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_message_bindings_message_provider_unique" ON "provider_message_bindings" USING btree ("message_id","provider");--> statement-breakpoint
CREATE INDEX "provider_message_bindings_conversation_idx" ON "provider_message_bindings" USING btree ("provider_conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_type_value_unique" ON "user_identities" USING btree ("type","normalized_value");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_primary_type_unique" ON "user_identities" USING btree ("user_id","type") WHERE "user_identities"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "user_identities_user_idx" ON "user_identities" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_states" ADD CONSTRAINT "conversation_states_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_created_idx" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_states_conversation_unique" ON "conversation_states" USING btree ("conversation_id");
