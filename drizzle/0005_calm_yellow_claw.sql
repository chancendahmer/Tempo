ALTER TYPE "public"."message_status" ADD VALUE 'processed' BEFORE 'sent';--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "task_events_source_message_unique" ON "task_events" USING btree ("source_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_source_message_unique" ON "tasks" USING btree ("source_message_id");