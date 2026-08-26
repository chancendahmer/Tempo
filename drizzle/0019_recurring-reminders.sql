ALTER TABLE "reminders" ADD COLUMN "recurrence" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "occurrence_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_recurrence_check" CHECK ("reminders"."recurrence" is null or "reminders"."recurrence" in ('daily', 'weekdays', 'weekly'));