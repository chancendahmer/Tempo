CREATE TYPE "public"."goal_event_type" AS ENUM('created', 'updated', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "goal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"source_message_id" uuid NOT NULL,
	"event_type" "goal_event_type" NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_events" ADD CONSTRAINT "goal_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_events" ADD CONSTRAINT "goal_events_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_events" ADD CONSTRAINT "goal_events_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_events_goal_created_idx" ON "goal_events" USING btree ("goal_id","created_at");--> statement-breakpoint
CREATE INDEX "goal_events_user_created_idx" ON "goal_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_events_source_message_unique" ON "goal_events" USING btree ("source_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goals_source_message_unique" ON "goals" USING btree ("source_message_id");