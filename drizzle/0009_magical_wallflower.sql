CREATE TYPE "public"."messaging_provider" AS ENUM('linq', 'twilio', 'test');--> statement-breakpoint
DROP INDEX "conversation_messages_provider_sid_unique";--> statement-breakpoint
DROP INDEX "interventions_provider_sid_unique";--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "provider" "messaging_provider";--> statement-breakpoint
ALTER TABLE "interventions" ADD COLUMN "provider" "messaging_provider";--> statement-breakpoint
UPDATE "conversation_messages" SET "provider" = 'twilio' WHERE "provider_message_sid" IS NOT NULL;--> statement-breakpoint
UPDATE "interventions" SET "provider" = 'twilio' WHERE "provider_message_sid" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_provider_message_unique" ON "conversation_messages" USING btree ("provider","provider_message_sid");--> statement-breakpoint
CREATE UNIQUE INDEX "interventions_provider_message_unique" ON "interventions" USING btree ("provider","provider_message_sid");
