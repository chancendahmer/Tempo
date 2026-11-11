# Hybrid reminders and proactive interventions

Tempo uses durable scheduling plus bounded AI judgment. It does not run one always-on model agent per user.

## Two paths

### Explicit reminders

“Remind me tomorrow at 10 PM to submit the report” becomes a validated `create_reminder` command with an exact offset-bearing timestamp. Tempo stores the reminder and its original message, then inserts a `deliver_reminder` scheduled action. The worker dispatches due actions on its normal poll, so reminders survive restarts and deploys. Explicit reminders do not depend on the proactive intervention score.

### Proactive interventions

Every active user has a recurring context evaluation. The current cadence is five minutes. Each evaluation follows this order:

1. Load account-scoped consent, explicit check-in opt-in, onboarding, quiet hours, pause state, recent conversation and optional contacts, open tasks, calendar free/busy, learned response rate, and active extension signals.
2. Apply hard gates, including a maximum of three optional contacts per local day, at least two hours between optional contacts, and a calendar sync from the past 45 minutes. Missing, stale, or future-dated calendar syncs block proactive delivery.
3. Rank actionable tasks using urgency, fit in the available window, and recently saved Thoughts explicitly linked to those tasks. Require at least five free minutes for a coaching check-in. An active Focus timer blocks optional contact. When there is no saved timer, a recently started task holds check-ins for its estimated duration, with the workspace's 25-minute default when there is no estimate. An unfinished routine near its saved local start time and recent workspace edits reduce the score. Save the score and its weighted breakdown.
4. Apply the randomized product holdout.
5. For a send candidate with AI review enabled, reserve a blocked snapshot before invoking the reviewer. The reviewer can veto eligibility, and duplicate evaluations of the opportunity reuse the existing snapshot.
6. Claim the delivery under an account lock and enforce the shared daily cap and cooldown across coaching and cleanup check-ins. Compose the wording and append the deterministic response choices.
7. Before committing the outbound submission, recheck the candidate under the account lock against the current task, calendar, workspace, consent, and optional-contact state. Use the durable outbound idempotency key to prevent duplicate provider submission.

Old-item reviews also recheck eligibility under the account lock before provider submission. A temporary hold keeps the existing review reservation so the next eligible evaluation can retry it. Reviews count against the shared cooldown and cap as soon as their provider submission starts.

The global coaching switches require `INTERVENTION_SHADOW_MODE=false` and `AUTONOMOUS_SENDING_ENABLED=true`. An operator can allow an individual account through `PROACTIVE_CANARY_USER_IDS` while the global switches stay off. The user's Check-ins preference and eligibility gates apply in both cases. `HYBRID_AI_REVIEW_ENABLED=false` removes the AI veto while preserving deterministic scoring and AI wording.

Recent edits use the stored update time, decay over 15 minutes, and use the latest qualifying record across workspace areas. Meal plans, food logs, and workout logs contribute only for their recorded local day. Changes to saved Thoughts, nutrition targets, and workout plans contribute recent activity as well. Task-linked Thoughts contribute a separate ranking signal that decays over 24 hours. The check-in snapshot records the weighted contributions. Meal contents, nutrient amounts, workout notes, and Thought bodies stay out of the check-in scoring payload and model review.

Coaching texts and their start/snooze replies are attached to an open task. Standalone meal, nutrition, routine, fitness, or Thought coaching would require typed targets and their own follow-up behavior. Scheduled tasks created from those areas are eligible through the existing task path.

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
