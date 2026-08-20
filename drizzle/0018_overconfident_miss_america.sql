UPDATE "users" SET "intervention_cooldown_minutes" = 5 WHERE "intervention_cooldown_minutes" = 240;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "intervention_cooldown_minutes" SET DEFAULT 5;
