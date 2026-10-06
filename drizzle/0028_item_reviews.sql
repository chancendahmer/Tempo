CREATE TABLE item_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target jsonb NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','sent','closed','cancelled')),
  message_id uuid REFERENCES conversation_messages(id) ON DELETE SET NULL,
  response_message_id uuid REFERENCES conversation_messages(id) ON DELETE SET NULL,
  reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  next_review_at timestamptz NOT NULL,
  resolved_at timestamptz
);
--> statement-breakpoint
CREATE INDEX item_reviews_user_created_idx ON item_reviews (user_id, created_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX item_reviews_one_reserved_idx ON item_reviews (user_id) WHERE status = 'reserved';
