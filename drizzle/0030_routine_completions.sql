CREATE TABLE routine_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id uuid NOT NULL,
  step_id uuid NOT NULL,
  completed_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX routine_completions_user_step_day_idx ON routine_completions (user_id, routine_id, step_id, completed_on);
--> statement-breakpoint
-- Preserve only observed, saved checkoff dates. Routine creation/update dates
-- do not establish activity, and no missing days are reconstructed.
INSERT INTO routine_completions (user_id, routine_id, step_id, completed_on)
SELECT item.user_id, item.id, (step->>'id')::uuid, (step->>'completedOn')::date
FROM life_items item
JOIN users account ON account.id = item.user_id
CROSS JOIN LATERAL jsonb_array_elements(item.data->'steps') step
WHERE item.data->>'kind' = 'routine'
  AND step->>'completedOn' IS NOT NULL
  AND (step->>'completedOn')::date <= (now() AT TIME ZONE account.timezone)::date
ON CONFLICT DO NOTHING;
