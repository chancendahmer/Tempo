DROP INDEX "reminders_source_message_unique";--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "source_operation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_source_operation_unique" ON "reminders" USING btree ("source_message_id","source_operation");