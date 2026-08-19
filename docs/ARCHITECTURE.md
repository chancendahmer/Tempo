# Tempo V1 architecture

## Objective

Tempo V1 tests whether context-aware SMS interventions increase task initiation. Architecture choices must support that experiment without growing into a general personal-assistant platform.

## Runtime topology

The repository produces two processes:

1. **Web:** the existing Next.js application, marketing pages, consent endpoint, Linq/Twilio webhooks, Google OAuth, and health endpoints.
2. **Worker:** a TypeScript process that consumes durable PostgreSQL jobs for message processing, calendar synchronization, context evaluation, follow-ups, and delivery retries.

PostgreSQL is the only durable state system in V1. A Postgres-backed job queue avoids introducing Redis.

## Module boundaries

```text
src/app                 Web UI and HTTP route handlers
src/server/config       Validated runtime configuration
src/server/db           Schema, migrations, and database access
src/server/domain       Pure product rules and state transitions
src/server/adapters     Messaging, Google, and LLM provider integrations
src/server/jobs         Durable job definitions and handlers
src/worker              Worker process entrypoint
```

Route handlers and job handlers may call domain services. Domain services must not import Next.js, Linq, Twilio, Google, or an LLM SDK.

Linq is the primary messaging adapter. It uses managed line selection and the best available service across iMessage, RCS, and SMS. Twilio remains an optional RCS/SMS adapter behind the same transport contract. Provider and provider-message ID are stored together so identifiers from different providers cannot collide.

Task, goal, memory, and rescheduling changes cross a validated command boundary before repositories mutate data. Source-message identifiers make retries idempotent and preserve an audit trail. Ambiguous task or goal references are held as conversation state until the user chooses one. Rescheduling likewise stores a concrete calendar-derived proposal and changes the due date only after confirmation.

## Decision pipeline

Autonomous messaging uses three deterministic stages:

1. **Eligibility:** consent, active status, quiet hours, cooldown, daily cap, pending intervention, and calendar-busy checks.
2. **Task selection:** choose the best actionable task from explicit user data.
3. **Moment score:** compute a versioned score and reason breakdown.

Only after all three stages authorize a send may the LLM draft a message. The model cannot override eligibility rules.

## Reliability rules

- Every provider webhook is authenticated before processing.
- Provider event identifiers are unique in the database.
- Webhook routes persist and acknowledge quickly; expensive processing runs in the worker.
- Outbound messages use idempotency keys and delivery callbacks.
- State transitions are transactional.
- Scheduled jobs have bounded retries and dead-letter visibility.
- All autonomous sending begins in shadow mode.
- A temporary pause keeps the account active, blocks sends through `paused_until`, and schedules one context evaluation when the pause expires. A user may resume early, but never override a carrier opt-out with a coaching command.

## Privacy rules

- Phone numbers are normalized to E.164.
- OAuth refresh tokens and sensitive fields are encrypted at the application boundary.
- Calendar V1 uses free/busy data and does not retain event titles.
- Memory entries include provenance, confidence, sensitivity, and expiry.
- Only active, unexpired memory selected for the current request is supplied to the model; referencing it updates its audit timestamp.
- The LLM receives the minimum context required for the current operation.
- Development, staging, and production use separate credentials and databases.

## Model rules

- Structured actions use validated tool calls.
- Validated actions cover tasks, goals, and reschedule requests; repositories enforce user ownership independently of model output.
- Ambiguous destructive updates require confirmation.
- Model output is untrusted input and is schema-validated.
- Prompts and model names are versioned on generated interventions.
- Provider-specific code remains in `src/server/adapters/llm`.

## Measurement rules

- Every eligible intervention opportunity is logged, including no-send decisions.
- A configured percentage of eligible moments becomes a randomized holdout.
- Outcomes record their source: explicit reply, task-status change, or timeout.
- Product success is incremental task initiation versus matched holdout opportunities, with opt-out and wrong-time rates as guardrails.
