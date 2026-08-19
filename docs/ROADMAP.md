# Tempo V1 delivery roadmap

This file is the implementation contract. A phase is complete only when its acceptance criteria pass. Later phases may depend only on completed phases.

**Current checkpoint:** Phases 0–6 and Phase 7's provider-free work are complete. Sendblue is the active provider for the controlled 10-contact sandbox demo, with authenticated webhooks, provider-aware idempotency, website-triggered contact verification, first-reply phone activation, and an embedded-photo Tempo contact card. Linq and Twilio remain optional adapters behind the same transport boundary. The acceptance journey verifies web consent → messaging onboarding → task creation → context scoring → one idempotent intervention → task initiation → helpfulness feedback against migrated embedded PostgreSQL. Railway worker deployment and live Sendblue/Google/Anthropic verification await founder-owned credentials; autonomous sending remains doubly disabled.

## Phase 0 — Architecture and delivery contract

**Deliverables**

- Account and credential checklist
- Runtime and module boundaries
- Environment-variable contract
- Milestone acceptance criteria

**Acceptance**

- No provider secret is required to run lint, type checks, or unit tests.
- External providers are isolated behind adapters.
- Development defaults to intervention shadow mode.

## Phase 1 — Data and application foundation

**Deliverables**

- Validated server environment
- PostgreSQL schema and generated migrations
- Database connection and transaction helpers
- Structured logging with secret redaction
- Unit-test foundation and health endpoint

**Acceptance**

- Schema covers identity, consent, goals, tasks, calendar connections, messages, context snapshots, interventions, outcomes, memory, and jobs.
- Migration generation is deterministic.
- Domain tests run without live provider credentials.
- Lint, types, tests, and production build pass.

## Phase 2 — Consent-safe SMS transport

**Deliverables**

- Server-backed landing-page consent submission
- Sendblue webhook-secret validation, Linq Standard Webhooks validation, and optional Twilio signature validation
- Idempotent inbound webhook ingestion
- STOP, START, and HELP state transitions
- Outbound adapter and delivery-status webhook
- Virtual/test transport for automated tests

**Acceptance**

- Duplicate webhook delivery creates one message.
- An opted-out or paused user cannot receive an application-originated message.
- Webhook acknowledgement does not wait on an LLM call.
- Consent evidence is auditable.

## Phase 3 — Onboarding and task management

**Deliverables**

- SMS conversation state machine
- Timezone, quiet-hours, and coaching-style onboarding
- Create, list, update, complete, and abandon task tools
- Create, list, update, complete, and abandon goal tools
- Calendar-backed reschedule proposals that require user confirmation
- Ambiguity and confirmation handling

**Acceptance**

- Natural-language fixtures produce validated task, goal, and reschedule operations.
- Ambiguous mutations do not silently change data.
- Every action is traceable to its source message.

## Phase 4 — Google Calendar awareness

**Deliverables**

- OAuth start and callback routes with state protection
- Encrypted refresh-token storage
- Free/busy synchronization and token refresh
- Disconnect and data-deletion flow

**Acceptance**

- OAuth state/replay tests pass.
- Calendar failure never blocks inbound SMS handling.
- No event titles are stored.

## Phase 5 — Shadow context engine

**Deliverables**

- Eligibility policy
- Task selector
- Versioned intervention scoring configuration
- Scheduled per-user evaluation
- Founder-readable decision report

**Acceptance**

- Every decision includes reason codes and a score breakdown.
- Quiet hours, caps, cooldowns, and pending-response rules are hard blocks.
- No SMS is sent while shadow mode is enabled.

## Phase 6 — Interventions, feedback, and learning

**Deliverables**

- Five intervention strategies
- Model-generated copy constrained by deterministic policy
- Body-doubling and delayed follow-up jobs
- Outcome attribution and randomized holdouts
- Structured memory with provenance and decay

**Acceptance**

- All autonomous messages remain idempotent.
- Holdout decisions are logged and reproducible.
- User corrections can supersede or delete memory.
- Temporary pauses expire without permanently changing the user's active status.

## Phase 7 — Staging and beta readiness

**Deliverables**

- Railway web, worker, and PostgreSQL services
- Staging end-to-end tests with the selected messaging provider and Google; optional fallback matrix
- Backup, monitoring, rate-limit, and failure runbooks
- Beta metrics query set
- Production launch checklist and kill switch

**Acceptance**

- The system can support a controlled beta of at least 100 consented users, with invitation gating, production-capable messaging capacity, feedback capture, and founder-readable activation, retention, delivery, opt-out, and helpfulness metrics.
- A real opt-in can complete onboarding, manage a task, connect a calendar, receive an approved intervention, and record an outcome.
- Delivery failures and provider outages degrade safely.
- Production sending remains disabled until founder sign-off.
