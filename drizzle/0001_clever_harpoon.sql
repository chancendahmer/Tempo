CREATE UNIQUE INDEX "intervention_policies_one_active_unique" ON "intervention_policies" USING btree ("active") WHERE "intervention_policies"."active" = true;--> statement-breakpoint
ALTER TABLE "calendar_busy_windows" ADD CONSTRAINT "calendar_busy_windows_range_check" CHECK ("calendar_busy_windows"."ends_at" > "calendar_busy_windows"."starts_at");--> statement-breakpoint
ALTER TABLE "context_snapshots" ADD CONSTRAINT "context_snapshots_bucket_check" CHECK ("context_snapshots"."randomized_bucket" is null or "context_snapshots"."randomized_bucket" between 0 and 9999);--> statement-breakpoint
ALTER TABLE "intervention_policies" ADD CONSTRAINT "intervention_policies_holdout_check" CHECK ("intervention_policies"."holdout_basis_points" between 0 and 10000);--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_confidence_check" CHECK ("memory_entries"."confidence" is null or "memory_entries"."confidence" between 0 and 1);--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_evidence_count_check" CHECK ("memory_entries"."evidence_count" >= 1);--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_attempts_check" CHECK ("scheduled_actions"."attempts" >= 0);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_estimated_minutes_check" CHECK ("tasks"."estimated_minutes" is null or "tasks"."estimated_minutes" between 1 and 1440);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_e164_check" CHECK ("users"."phone_e164" ~ '^\+[1-9][0-9]{7,14}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_daily_intervention_cap_check" CHECK ("users"."daily_intervention_cap" between 0 and 10);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_cooldown_minutes_check" CHECK ("users"."intervention_cooldown_minutes" >= 0);