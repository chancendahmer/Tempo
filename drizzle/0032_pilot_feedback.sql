CREATE TABLE "pilot_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL CONSTRAINT "pilot_feedback_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE CASCADE,
  "request_id" uuid NOT NULL,
  "type" text NOT NULL CHECK ("type" IN ('problem', 'improvement')),
  "section" text NOT NULL CHECK ("section" IN ('today','tasks','calendar','goals','reminders','routines','wake','meals','recipes','groceries','nutrition','movement','inbox','memories','assistant','settings','other')),
  "impact" text NOT NULL CHECK ("impact" IN ('blocked', 'slowed', 'minor', 'idea')),
  "encrypted_detail" text,
  "follow_up_consent" boolean DEFAULT false NOT NULL,
  "payload_hmac" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pilot_feedback_user_request_unique" ON "pilot_feedback" ("user_id", "request_id");
--> statement-breakpoint
CREATE INDEX "pilot_feedback_created_idx" ON "pilot_feedback" ("created_at");
