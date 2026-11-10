# Private-pilot activation and feedback audit — 2026-10-22

Scope: source inspection of phone signup/login, account recovery, initial workspace/setup, first task/reminder, Calendar connection, pilot admission and product feedback. Baseline `d7e1a0e`; no product source changed in this audit. No real credentials, provider API, customer account, outbound messages, Calendar writes or production database were used. Browser journeys were not rerun by this reviewer.

## Pilot blockers and priorities

| Priority | Finding | Evidence and practical consequence |
| --- | --- | --- |
| P1 | Public Calendar privacy disclosure is stale | `src/app/privacy/page.tsx` says access is read-only. `src/server/adapters/calendar/google-calendar-provider.ts` requests `calendar.events.owned`; `calendar-assistant.ts` reads events and can insert/patch/delete after confirmation. Extensions copy already explains this correctly. An invited user cannot assess current permissions from the privacy page. Fix before pilot consent/connection; review matching Terms/architecture claims. |
| P1 | Private admission is not implemented in the public signup path | `src/app/api/early-access/route.ts` validates phone/consent and rate limits, then calls provider onboarding before consent/session creation. No invite, cohort or total-seat check exists in that path. `src/server/domain/consent.ts` has no admission input. A publicly reachable service can provision numbers beyond an intended 10–100 cohort. Proactive delivery allowlists govern outreach, not signup admission or provider provisioning. |
| P1 | No structured, private product-issue reporting loop | No customer issue route, form or persisted product-report entity found in `src/app`, configuration or relevant schema. Existing `outcome-tracker.ts`/`feedback_followup` record whether an intervention helped, not reproducible application problems. HELP is SMS service guidance; public legal pages refer users there. Users need an explicit issue report that does not require pasting private chat. |
| P1 release evidence | Full fresh-person round trip is still unverified on this candidate | Prior QA proves local HTTP and synthetic browser sessions; adaptive follow-through explicitly leaves live model/worker, provider round trip, delivered reminder and real Calendar read/confirmed write open. A scripted transcript or passing unit test cannot establish actual delivery or unfamiliar-person completion. |
| P2 | Browser personalization can precede required local-time setup | Users default to `UTC` in `src/server/db/schema.ts`; `GentleSetup.tsx` collects name/tone/streak, not timezone or quiet hours. SMS introduction separately asks contact/DONE-or-SKIP → timezone → quiet hours → tone → Calendar-or-SKIP. A verified browser can create a task before that SMS flow completes. Local-time reminder behavior should be demonstrated and current timezone made obvious before first scheduling. This is a source-supported risk, not an observed wrong delivery. |
| P2 | Activation has no explicit first-success handoff | Current initial SMS path goes from contact to preferences and Calendar; `first_task` is a legacy state tested separately. Web empty To-do correctly offers “Add to-do”; Reminders opens an unsent “Remind me to” draft. Optional personalization and tour introduce many sections, but do not guide a novice through a saved task plus a confirmed, visible reminder. Existing capabilities should be joined with a short, dismissible first-success checklist rather than another mandatory tour. |

## Implemented capabilities to preserve

- `PhoneSignup.tsx`: explicit unchecked consent, normalized country/area-number input, provider-specific next step, masked account status via polling, automatic workspace entry after verification. Shared Sendblue honestly asks the user to text START; it does not claim a text was delivered. Verified returning contacts queue a one-use sign-in link.
- `web-session.ts` and `/api/auth/phone`: requesting-browser activation and a separate phone session; one-use session-bound links, read-only GET for link previews, explicit POST confirmation, 15-minute claim bound, revoked/expired/mismatched claims rejected. `messaging-repository.ts` prevents ordinary inbound text approving a browser explicitly waiting for a sign-in link.
- Recovery already exists: “Use a different number” and “Back to sign in” first revoke the pending claim, then clear storage; failures retain a retryable waiting state. Workspace account menu shows name/masked phone and “Switch account / Log out”; logout clears the loaded workspace and signup marker.
- Empty real accounts are empty, not fictional preview content. To-do offers direct task creation. Reminders offers an assistant draft; draft text is not automatically sent. Shared account identity is sourced from the verified session, not a client-supplied user ID.
- Web setup is optional and persists its choices; it can be reopened in Settings. Calendar connection UI gates controls on phone verification, distinguishes disconnected/reauth, retries failed loads, and accurately explains confirmed personal event edits. Health Connect and Google Tasks are visibly planned/disabled.
- `scripts/beta-report.ts` provides aggregate/account-masked intervention outcomes and task completion. It is useful for coaching outcomes but has no invitation-to-first-task/reminder funnel or product-issue lifecycle. It was inspected only, not executed against any configured database.

## Validation in this audit

Executed:

```text
npm run test -- src/app/components/PhoneSignup.test.ts src/app/api/early-access/route.test.ts src/server/security/phone-signin-route.test.ts src/server/security/web-session.integration.test.ts src/server/domain/onboarding.test.ts src/app/api/account/setup/route.test.ts src/app/extensions/calendar-status.test.ts
```

Result: **7 files / 44 tests passed**, exit 0. Session integration tests use a fresh in-memory PGlite database and the migration chain. Provider route tests use mocks. These checks cover recovery markup/revocation ordering, provider-shaped signup routing, one-use session/account isolation, onboarding choices, setup authorization and Calendar copy. They do not exercise live carrier delivery, OAuth, an actual mobile device or current-browser interaction.

Prior evidence read: `qa/adaptive-followthrough/README.md` and `qa/customer-review-2026-10-18/waiting-recovery-setup.md`. Their historical passes remain attributed to those runs; this document does not relabel them as current observed behavior.

## Recommended bounded implementation: structured private issue reports

Implement one cohesive feedback path, keeping enrollment and live release verification separately owned. Proposed files:

- `src/server/domain/pilot-feedback.ts`: strict category/surface schema, optional bounded description, stable caller-generated request ID; permit only known UI sections and error categories. Reject arbitrary metadata/attachments.
- `src/server/db/schema.ts`, one additive migration, `src/server/db/repositories/pilot-feedback-repository.ts`: account-owned durable report with encrypted user-written description, timestamp, category/surface, idempotency key and simple open/resolved status. Account deletion must remove reports through the existing ownership cascade. Avoid message bodies, phone numbers, Calendar titles/tokens, URL queries, screenshots and automatic transcript attachment.
- `src/app/api/account/feedback/route.ts`: verified-session account derivation, same-origin mutation protection, schema validation, durable per-account rate limit and idempotent creation. Return only a report reference and acknowledgement. Never send notifications externally or invoke the model.
- `src/app/workspace/PilotFeedback.tsx` and a small `WorkspaceClient.tsx` integration: accessible “Report a problem” in Settings; category/area plus optional own description; explicitly state no chat is automatically attached; preview mode must never submit. Preserve draft on failure, report durable success only after commit.
- `scripts/pilot-feedback-report.ts` (metadata only): safe operator listing by opaque report/account IDs, category, area, age/status and counts. Do not print description or chats by default. A real operator triage procedure must name who reviews reports and expected response time before inviting people; this code alone does not create support staffing.

Acceptance criteria: authenticated A can create a report; B cannot read or mutate it; unverified/foreign-origin/invalid/oversized/rate-limited requests create nothing; retries with the same request ID create one row; encryption prevents plaintext user description in storage; error paths/logs contain no description or chat; deleting an account removes reports; failed submission retains form content; keyboard focus stays in the dialog and returns to its opener; preview submits nothing; successful submission shows a stable receipt. Nearest domain/API/repository tests, lint, typecheck and full check for the schema/API/UI change. Root browser owner verifies a synthetic account at desktop and mobile widths. No external send is required.

## Other bounded work options

Private admission can be smaller than feedback if prioritized: add an explicit disabled-by-default rollout mode plus exact phone allowlist derived from protected deployment configuration, reject before any provider call/consent/session write, allow already-enrolled users to return, and test closed/misconfigured/uninvited paths. Do not call a public URL “private pilot” based only on obscurity. For a 100-person cohort, durable invitation/admission records with atomic capacity/revocation are preferable to manual environment lists; choose one operational model before implementation.

First-success onboarding can reuse task creation and reminder drafts: display verified masked phone and account timezone, show “Save one task” and “Set one reminder” only until actual persisted records exist, link to current controls, and explain SMS/dashboard share the same phone account. Do not equate clicking a draft with a saved reminder or provider delivery. Reuse existing sign-in recovery; it does not need redesign.

## Fresh-person pilot acceptance run

Use one invited synthetic account with approved dedicated test line for the eventual live run. Record times and opaque identifiers, not private content: invitation/admission → consent → START/provider verification → browser link confirmation → masked-phone match → optional setup skip → first task saved and present after reload → first reminder shows intended local time in dashboard → reminder actually delivered to that same phone → logout/switch → original account recovered → issue report receipt. Independently record provider delivery status and worker action state. Test expired/replayed link, wrong number recovery, service failure and Calendar-denied/skip separately. An unfamiliar participant must complete this without coaching from the developer; this remains an acceptance criterion, not a claim of completion.
