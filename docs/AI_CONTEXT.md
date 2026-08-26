# AI context router

This file is an on-demand navigation aid, not required reading for every task.
Use it when the responsible subsystem is unclear or a change crosses boundaries.
Start with one row, inspect the named symbol and nearest test, and expand only
when the evidence requires it.

## Task routing

| Task | Start with | Optional reference |
| --- | --- | --- |
| Marketing UI, account UI, or HTTP route | `src/app` and the nearest component or route | Relevant guide in `node_modules/next/dist/docs/` |
| Account sessions or action links | `src/server/security` and the corresponding test | `docs/ARCHITECTURE.md` privacy and reliability sections |
| Incoming or outgoing SMS | `src/server/adapters/sms`, then the shared messaging contract | `docs/MESSAGING_PROVIDERS.md` |
| Tasks, goals, reminders, or rescheduling | Matching module in `src/server/domain` and its test | `docs/HYBRID_INTERVENTION_SYSTEM.md` when scheduling or intervention policy is involved |
| Conversation state or orchestration | `conversation-orchestrator.ts`, `conversation-history.ts`, and their repositories/tests | `docs/ARCHITECTURE.md` |
| Context evaluation, interventions, or accountability | Context/intervention domain module, matching job handler, and test | `docs/HYBRID_INTERVENTION_SYSTEM.md` |
| Calendar availability or OAuth | Calendar domain module, `src/server/adapters/calendar`, and calendar repositories | `docs/ARCHITECTURE.md` privacy rules |
| Worker execution or durable jobs | `src/worker`, `src/server/jobs`, and the scheduled-action repository | `docs/OPERATIONS.md` for runtime behavior |
| Database schema or persistence | `src/server/db/schema.ts`, one repository, and its integration test | Relevant migration under `drizzle`; avoid loading generated snapshots by default |
| Model parsing or composition | `src/server/adapters/llm` and the matching domain boundary/test | `docs/ARCHITECTURE.md` model rules |
| Deployment or production operations | Relevant Railway file or script | One of `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`, or `docs/LAUNCH_CHECKLIST.md` |
| Controlled demo work | Demo report/smoke script and active messaging adapter | `docs/SANDBOX_DEMO.md` |

## Context expansion ladder

Use the smallest step that resolves the question:

1. Requested path, symbol, or failing test.
2. Imports, exported types, and nearest unit test.
3. Direct callers or repository used by that symbol.
4. One relevant subsystem document from the table above.
5. Adjacent subsystem only if the observed behavior crosses the boundary.

Stop when the implementation and acceptance criteria are supported by evidence.
Do not read all architecture or operational documents as general orientation.

## Repository invariants worth checking

- The web process handles requests; the worker owns expensive and retryable
  processing.
- PostgreSQL and pg-boss provide durable state and jobs; do not add another
  durable system casually.
- Tempo owns identities, conversations, tasks, reminders, memory, and message
  relationships independently from the active delivery provider.
- Provider events and outbound operations must remain idempotent.
- User consent, carrier opt-outs, quiet hours, cooldowns, caps, calendar-busy
  status, and pending-response gates outrank model recommendations.
- Calendar handling is privacy-minimized; V1 uses free/busy data and does not
  retain event titles.
- Sensitive stored fields are encrypted at the application boundary.

## Validation routing

- Local domain or adapter change: run its nearest `*.test.ts` first.
- Repository/database behavior: run the corresponding `*.integration.test.ts`.
- Next.js code: consult the relevant bundled Next.js guide, then run targeted
  checks plus lint and typecheck.
- Cross-cutting or release-bound change: run `npm run check` after targeted
  iteration.
- Documentation-only change: verify links, paths, commands, and consistency;
  application tests are not normally required.

## Task brief template

Use this when starting a new task:

```text
Goal:
Starting file or symbol:
Expected behavior:
Constraints or invariants:
Acceptance criteria:
Validation to run:
Out of scope:
```

Example:

```text
Goal: Prevent duplicate Sendblue webhook processing.
Starting file: src/server/adapters/sms/sendblue-webhook.ts and its test.
Expected behavior: Replayed provider events do not create duplicate work.
Constraints: Preserve webhook authentication and provider-neutral contracts.
Acceptance criteria: Add a regression test that fails before the fix and passes after.
Validation: Targeted test, lint, and typecheck.
Out of scope: Linq and Twilio changes unless the shared contract requires them.
```

For an unrelated goal, start a new Codex task. Keep the same task for direct
follow-up debugging where the existing evidence is still useful.
