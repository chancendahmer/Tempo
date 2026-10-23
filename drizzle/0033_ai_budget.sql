CREATE TABLE ai_budget_states (
  scope_key text PRIMARY KEY,
  account_id uuid CONSTRAINT ai_budget_states_account_id_users_id_fk REFERENCES users(id) ON DELETE SET NULL,
  window_day date NOT NULL,
  settled_microdollars bigint NOT NULL DEFAULT 0,
  settled_calls bigint NOT NULL DEFAULT 0,
  outstanding_microdollars bigint NOT NULL DEFAULT 0,
  outstanding_calls bigint NOT NULL DEFAULT 0,
  halted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_budget_states_nonnegative CHECK (settled_microdollars >= 0 AND settled_calls >= 0 AND outstanding_microdollars >= 0 AND outstanding_calls >= 0)
);
--> statement-breakpoint
CREATE INDEX ai_budget_states_account_idx ON ai_budget_states(account_id);
--> statement-breakpoint
CREATE TABLE ai_budget_attempts (
  id uuid PRIMARY KEY,
  account_id uuid CONSTRAINT ai_budget_attempts_account_id_users_id_fk REFERENCES users(id) ON DELETE SET NULL,
  account_key text NOT NULL,
  execution_id uuid NOT NULL,
  operation text NOT NULL,
  model text NOT NULL,
  price_version text NOT NULL,
  policy_version text NOT NULL,
  reservation_fingerprint text NOT NULL,
  window_day date NOT NULL,
  reserved_microdollars bigint NOT NULL,
  actual_microdollars bigint,
  state text NOT NULL DEFAULT 'reserved',
  usage jsonb,
  failure_category text,
  bound_violation boolean NOT NULL DEFAULT false,
  reconciliation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_budget_attempts_nonnegative CHECK (reserved_microdollars >= 0 AND (actual_microdollars IS NULL OR actual_microdollars >= 0)),
  CONSTRAINT ai_budget_attempts_state_check CHECK (state IN ('reserved', 'submitting', 'uncertain', 'settled')),
  CONSTRAINT ai_budget_attempts_operation_check CHECK (operation IN ('assistant', 'turn_authorization', 'intervention_review', 'intervention_composition', 'task_presentation'))
);
--> statement-breakpoint
CREATE INDEX ai_budget_attempts_account_idx ON ai_budget_attempts(account_id);
--> statement-breakpoint
CREATE INDEX ai_budget_attempts_window_idx ON ai_budget_attempts(window_day, state);
--> statement-breakpoint
CREATE INDEX ai_budget_attempts_execution_idx ON ai_budget_attempts(execution_id);
