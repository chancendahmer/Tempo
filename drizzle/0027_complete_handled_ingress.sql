-- An inbound is complete once its synchronous consent action or durable
-- onboarding/compliance delegation exists. Do not replay old user commands.
UPDATE conversation_messages AS m SET status='processed', updated_at=now()
WHERE m.direction='inbound' AND m.status='received'
  AND NOT EXISTS (SELECT 1 FROM scheduled_actions s WHERE s.user_id=m.user_id
    AND s.kind='process_inbound_message' AND s.payload->>'messageId'=m.id::text)
  AND (
    EXISTS (SELECT 1 FROM consent_records c WHERE c.user_id=m.user_id
      AND c.evidence->>'providerMessageId'=m.provider_message_sid
      AND c.evidence->>'provider'=m.provider::text)
    OR EXISTS (SELECT 1 FROM scheduled_actions s WHERE s.user_id=m.user_id
      AND s.kind IN ('send_welcome','send_compliance') AND s.idempotency_key IN (
        'help:'||m.provider||':'||m.provider_message_sid,
        'welcome:'||m.user_id::text||':verified:'||m.provider||':'||m.provider_message_sid,
        'welcome:'||m.user_id::text||':messaging-start:'||m.provider||':'||m.provider_message_sid))
  );
