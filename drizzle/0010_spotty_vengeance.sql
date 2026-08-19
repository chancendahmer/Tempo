CREATE TYPE "public"."messaging_service" AS ENUM('iMessage', 'RCS', 'SMS');--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "provider_service" "messaging_service";