CREATE TABLE "food_lookup_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"products" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "life_action_receipts" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "life_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "life_action_receipts" ADD CONSTRAINT "life_action_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_items" ADD CONSTRAINT "life_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "life_items_user_idx" ON "life_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "life_items_user_kind_idx" ON "life_items" USING btree ("user_id",("data"->>'kind'));--> statement-breakpoint
CREATE UNIQUE INDEX "life_items_one_focus_idx" ON "life_items" USING btree ("user_id") WHERE "life_items"."data"->>'kind' = 'focus';