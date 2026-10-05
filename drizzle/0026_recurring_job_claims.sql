ALTER TABLE "scheduled_actions" ADD COLUMN "attempt_token" uuid;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN "attempt_expires_at" timestamp with time zone;