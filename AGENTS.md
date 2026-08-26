# Tempo agent guide

## Product and runtime

Tempo is a consent-first SMS executive-function coach. The Next.js process
serves the UI and HTTP endpoints. A separate TypeScript worker consumes durable
PostgreSQL/pg-boss jobs. PostgreSQL is the only durable state system.

## Work narrowly

- Start with paths and symbols named in the request.
- Search with `rg`, then inspect the relevant symbol, its imports, direct
  callers, related types, and nearest tests. Expand only when evidence requires
  it; do not inventory the repository for a localized task.
- Prefer a cohesive small file over many fragmented reads, but avoid large,
  unfocused file or command output. Summarize long logs, tests, and diffs.
- Never read real secret files such as `.env`, `.env.local`, other populated
  environment files, `*.pem`, `*.key`, `secrets.*`, or
  `local.settings.json`. Ask the user for required values. `.env.example` may be
  read only when the environment contract is relevant.
- Ignore generated or bulky paths unless the task specifically concerns them:
  `.next`, `dist-ops`, `dist-worker`, `coverage`, `qa/*.png`, `drizzle/meta`,
  `*.tsbuildinfo`, and `package-lock.json`.
- Exception: before modifying Next.js code, read the relevant local guide under
  `node_modules/next/dist/docs/` as required below.
- Consult `docs/AI_CONTEXT.md` only when the responsible subsystem is unclear or
  the task crosses subsystem boundaries. Do not load every linked document.

## RTK output compression

- When `rtk` is available, prefer the verified read-only Git filters:
  `rtk git status`, `rtk git diff`, and `rtk git log`.
- Treat other RTK wrappers as opt-in and smoke-test them in the current shell;
  on native Windows, do not assume Unix-backed `read`, `grep`, `find`, or
  `tree` commands are available.
- Use raw commands when exact, unfiltered content is required. Do not route
  mutating Git, deployment, migration, or data commands through RTK.
- Keep validation authoritative: run the repository's normal npm scripts. If an
  RTK-filtered test, typecheck, lint, or build is used, rerun it raw whenever it
  exits nonzero, reports success with a nonzero exit, omits diagnostics, or
  times out. Stop only processes known to have been spawned by that command.

## Code map

- `src/app`: UI and HTTP route handlers
- `src/worker`: worker entrypoint and runtime
- `src/server/domain`: product rules and state transitions
- `src/server/adapters`: SMS, calendar, and LLM provider integrations
- `src/server/db`: schema and repositories
- `src/server/jobs`: durable jobs and handlers
- `src/server/security`: sessions, action tokens, and field encryption
- `drizzle`: database migrations
- `scripts`: operational and reporting commands
- `docs`: architecture and operational references

## Architecture invariants

- Domain services do not import Next.js or provider SDKs.
- Authenticate provider webhooks before processing. Persist and acknowledge
  quickly; perform expensive work in the worker.
- Preserve idempotency, transactional state changes, consent, carrier opt-outs,
  quiet hours, calendar-busy checks, cooldowns, caps, and confirmation gates.
- AI review may veto an intervention but may not bypass deterministic safety
  gates.
- Treat model output as untrusted input and schema-validate it.
- Supply models only the context required for the current operation.
- Keep provider-specific behavior behind the existing adapter contracts.

## Validation

- Run the nearest relevant tests while iterating.
- For code changes, run lint and typecheck unless the task is explicitly a
  narrow documentation-only change.
- Run `npm run check` for broad, cross-cutting, release-bound, or high-risk
  changes.
- Do not claim validation that was not run, and do not hide relevant failures
  by over-filtering command output.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
