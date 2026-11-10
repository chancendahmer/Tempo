CREATE TABLE "outbound_disposition_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbound_disposition_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"message_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"manifest_version" integer NOT NULL,
	"manifest_sha256" text NOT NULL,
	"approval_ref" text NOT NULL,
	"operator_ref" text NOT NULL,
	"message_updated_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_disposition_events_decision_check" CHECK ("outbound_disposition_events"."decision" in ('close_unresolved_without_replay', 'reopen')),
	CONSTRAINT "outbound_disposition_events_version_check" CHECK ("outbound_disposition_events"."manifest_version" = 1),
	CONSTRAINT "outbound_disposition_events_digest_check" CHECK ("outbound_disposition_events"."manifest_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "outbound_disposition_events_approval_check" CHECK ("outbound_disposition_events"."approval_ref" ~ '^[a-zA-Z0-9_-]{1,80}$'),
	CONSTRAINT "outbound_disposition_events_operator_check" CHECK ("outbound_disposition_events"."operator_ref" ~ '^[a-zA-Z0-9_-]{1,80}$')
);
--> statement-breakpoint
ALTER TABLE "outbound_disposition_events" ADD CONSTRAINT "outbound_disposition_events_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbound_disposition_events_latest_idx" ON "outbound_disposition_events" USING btree ("message_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_disposition_events_manifest_once_idx" ON "outbound_disposition_events" USING btree ("message_id","manifest_sha256");