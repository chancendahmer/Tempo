CREATE TABLE "pending_delivery_receipts" (
	"provider" "messaging_provider" NOT NULL,
	"external_message_id" text NOT NULL,
	"status" "message_status" NOT NULL,
	"error_code" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"status_observed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pending_delivery_receipts_provider_external_message_id_pk" PRIMARY KEY("provider","external_message_id"),
	CONSTRAINT "pending_delivery_receipts_status_check" CHECK ("pending_delivery_receipts"."status" in ('queued','sent','delivered','failed','undelivered')),
	CONSTRAINT "pending_delivery_receipts_external_id_check" CHECK (length("pending_delivery_receipts"."external_message_id") between 1 and 255),
	CONSTRAINT "pending_delivery_receipts_error_code_check" CHECK ("pending_delivery_receipts"."error_code" is null or "pending_delivery_receipts"."error_code" ~ '^[A-Za-z0-9_-]{1,64}$')
);
--> statement-breakpoint
CREATE INDEX "pending_delivery_receipts_expiry_idx" ON "pending_delivery_receipts" USING btree ("expires_at");