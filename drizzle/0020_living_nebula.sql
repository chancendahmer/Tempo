ALTER TABLE "users" ALTER COLUMN "intervention_cooldown_minutes" SET DEFAULT 120;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "proactive_opt_in" boolean DEFAULT false NOT NULL;