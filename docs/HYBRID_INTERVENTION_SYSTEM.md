# Hybrid reminders and proactive interventions

Tempo uses durable scheduling plus bounded AI judgment. It does not run one always-on model agent per user.

## Two paths

### Explicit reminders

“Remind me tomorrow at 10 PM to submit the report” becomes a validated `create_reminder` command with an exact offset-bearing timestamp. Tempo stores the reminder and its original message, then inserts a `deliver_reminder` scheduled action. The worker dispatches due actions on its normal poll, so reminders survive restarts and deploys. Explicit reminders do not depend on the proactive intervention score.

### Proactive interventions

Every active user has a recurring context evaluation. The current cadence is five minutes. Each evaluation follows this order:

1. Load consent, account state, onboarding, quiet hours, pause state, daily cap, pending response, recent interventions, tasks, current free/busy calendar windows, learned response rate, and active extension signals.
2. Apply hard gates. Missing or stale calendar data is never treated as free time.
3. Select one actionable task and compute a versioned 0–100 opportunity score with a persisted breakdown.
4. Apply the randomized product holdout.
5. For a send candidate, optionally ask the bounded AI reviewer for a final approve/veto decision. The model cannot override a hard gate.
6. Atomically claim the user row and enforce the configured cooldown with an absolute five-minute minimum before delivery.
7. Use AI for concise wording, append deterministic response choices, persist the outbound message, and send through the active provider adapter.

`INTERVENTION_SHADOW_MODE=true` or `AUTONOMOUS_SENDING_ENABLED=false` prevents proactive sends. `HYBRID_AI_REVIEW_ENABLED=false` removes the AI veto while preserving deterministic scoring and AI wording.

## Accountability state machine

Sendblue receives text choices:

- Initial: `I will get started right now!` or `Give me 15`
- Fifteen-minute follow-up: `I told myself I would do it, starting now.` or `Not today sorry`

The state is stored in `intervention_accountability`. “Give me 15” creates a durable `accountability_followup` action for exactly fifteen minutes later. A start response attributes task initiation to the intervention; a decline records negative feedback without shame or repeated pushing. Provider-native polls can later map the same states and options onto the existing capability and poll tables.

## Extension signals

`extension_signal_snapshots` is the provider-neutral input boundary. Each extension publishes a typed, expiring signal with provenance, payload, observation time, validity, and optional confidence. Google Calendar currently publishes `google_calendar/availability` while retaining only opaque busy ranges. Future health, location, focus, weather, or productivity extensions can publish their own signals without changing job scheduling or provider messaging code.

## Operating safety

- Start in shadow mode and review context snapshots before enabling sends.
- Keep a daily cap even when the cooldown is short.
- Explicit reminders bypass opportunity scoring but still recheck consent, account status, and opt-out state immediately before sending.
- Calendar and extension signals expire; stale data cannot create a “free now” assumption.
- All scheduled actions and outbound messages are idempotent.
