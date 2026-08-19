ALTER TYPE "public"."message_status" ADD VALUE 'cancelled' BEFORE 'failed';--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_idempotency_key_unique" ON "conversation_messages" USING btree ("idempotency_key");