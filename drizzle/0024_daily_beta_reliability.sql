ALTER TABLE "conversation_messages" ADD COLUMN "processing_token" uuid;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "reply_body" text;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "outbound_state" text;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "submission_token" uuid;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "submission_started_at" timestamp with time zone;--> statement-breakpoint
-- Existing reservations cannot prove that a provider was never contacted.
UPDATE conversation_messages SET outbound_state = CASE
  WHEN status = 'cancelled' THEN 'suppressed'
  WHEN provider_message_sid IS NOT NULL OR status IN ('sent', 'delivered') THEN 'accepted'
  ELSE 'ambiguous' END WHERE direction = 'outbound';--> statement-breakpoint
UPDATE conversation_messages AS inbound SET reply_body = outbound.body
FROM conversation_messages AS outbound
WHERE inbound.direction = 'inbound' AND outbound.direction = 'outbound'
  AND outbound.idempotency_key = 'reply:' || inbound.id::text
  AND outbound.user_id = inbound.user_id AND outbound.conversation_id = inbound.conversation_id;--> statement-breakpoint
INSERT INTO message_relations (conversation_id, source_message_id, target_message_id, type)
SELECT inbound.conversation_id, outbound.id, inbound.id, 'reply'
FROM conversation_messages AS inbound JOIN conversation_messages AS outbound
  ON outbound.idempotency_key = 'reply:' || inbound.id::text
  AND outbound.user_id = inbound.user_id AND outbound.conversation_id = inbound.conversation_id
WHERE inbound.direction = 'inbound' AND outbound.direction = 'outbound'
ON CONFLICT DO NOTHING;
