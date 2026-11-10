# Adaptive Home checkpoint

2026-10-21 · isolated implementation for user review.

Follow-up: [independent reviews, repaired workflows, authenticated local account evidence, and remaining release work](../adaptive-followthrough/README.md). The historical evidence below describes the initial implementation; the follow-up adds real local PostgreSQL/HTTP/browser verification without claiming production provider delivery.

## Location

- Branch: `codex/tempo-adaptive-home`.
- Worktree: `C:/Users/chanc/.codex/worktrees/tempo-adaptive-home/Agentic AI Assistant SMS`.
- Base: `74e9f09fdf1c3697f5200ec572b89344a179f65d` from `codex/tempo-today-world`.
- Preview: `http://localhost:3103/workspace/preview`.
- No push, merge, production migration, or deployment. Original checkout and older design worktrees preserved.

## Implemented

Modern Home header with oval Home/Spaces/search/profile controls and the existing optional drawer. Full-width photographic activity banner, directly startable to-do list, today-only calendar with next-event emphasis, persistent composer, and existing Journey access.

Home selects content using account timezone, routines, saved meal plans, scheduled fitness tasks/calendar events, and current focus. Ongoing focus/calendar activity takes priority. Morning, dinner, wind-down, and workout lead times are editable; users can temporarily choose another view or save a pin. Tasks and calendar do not rotate away. Empty accounts receive empty states, not sample data.

New task presentation metadata holds category, starting minutes, source, and title. An existing-worker pg-boss job suggests icons and starter durations using a real model, at most eight tasks from one account per batch. New tasks render an immediate deterministic fallback while waiting. Manual choices take priority. Titles are treated as untrusted data; the tool output and exact ID set are validated. Optimistic updates protect concurrent title changes, manual choices, deleted tasks, and started tasks.

If the provider is unavailable, the worker stores an honest fallback and does not repeatedly charge for the same failure. A later title edit clears nonmanual suggestions for re-evaluation. This initial implementation intentionally does not continuously regenerate already saved fallback suggestions when funding returns.

Home's Start action creates task state and a durable focus session atomically through the authenticated workspace mutation. It uses the minutes shown on the clicked button, even if background metadata changes. Replays remain idempotent; changing the payload under an existing request ID is rejected. Other existing task-start callers retain their prior behavior unless they explicitly request a focus timer.

## Validation evidence

| Evidence | Result / limits |
| --- | --- |
| Full `npm run check` | Passed: lint, typecheck, 118 test files/868 tests; 2 files/3 tests skipped; Next production build and ops build. Raw local log: `check.log` (ignored by Git). |
| Final affected regression run | 35/35 tests across Home model, existing Today model/calendar, account persistence integration, and model adapter. |
| Final lint, typecheck, production build | Passed after the responsive/accessibility fixes. |
| Isolated PGlite database tests | Full migration chain, account isolation, consent unchanged, preference concurrency checks, manual icon/time overrides, atomic/idempotent focus, background enrichment races and fallback. No production database used. |
| Browser interaction | Desktop/tablet/phone/narrow-phone; timer edit/start/pause/resume/complete, banner modes, pin/settings, search/date navigation, Spaces, drawer, Journey. Fictional preview only. See `../../design-qa.md`. |
| Actual model API call | One Claude Sonnet 4.6 call with five fictional titles. 1,236 input tokens / 230 output tokens. Exact sanitized results in `live-model-result.json`. Correct categories for a nutrition report, groceries, packing a bag, workout, and dishes. Not a live SMS/Calendar test. |

Paid API testing for this implementation: estimated **US$0.007158** (under one cent), using $3/million input and $15/million output per [Anthropic's official pricing](https://platform.claude.com/docs/en/about-claude/pricing). No other paid test-provider calls were made in this implementation; image-generation tools are separate from this API-test accounting. This is an estimate from returned token usage, not an invoice reconciliation.

## Review walkthrough

1. Open the isolated preview. The desktop **Sample time** selector is a demo-only control; it does not change real accounts or the real focus clock.
2. Select 8:10 AM, 3:05 PM, 6:00 PM, and 9:30 PM to see the actual fixture routine/activity/meal selected automatically.
3. Use the banner menu for a temporary view; pin it or edit **Customize home** to persist within the demo session.
4. Click the small icon beneath a task to choose its icon and starting minutes. Click Start, pause/resume, and return Home. Complete the task.
5. Open Spaces or the top-left drawer. Search for a meal to jump to its selected date. Open Your journey.
6. Reload to reset fictional changes. Nothing here sends a text or edits a personal account.

## Resume / integration notes

- `node qa/adaptive-home/start.cjs` starts this isolated preview on 3103, using only local fake configuration. Stop any existing instance first. `--production` uses the built app. It is not a real account/provider environment.
- Before connecting this candidate to a real database, apply `drizzle/0031_pink_madame_hydra.sql` with the normal migration runner. It only adds nullable `tasks.presentation`; it does not recreate previously manual tables. Generated Drizzle snapshot now reflects those existing tables.
- Start the matching worker to enable `tempo.task-presentation`. It runs at most once per minute with single concurrency and a bounded adapter timeout. UI fallback does not require a working provider.
- No real-account browser login/persistence, live deployed worker job, real SMS delivery, or real Google Calendar mutation was performed for this Home-only task. Existing broader release gates still apply before release.
- Rollback: keep the additive column; old code ignores it and the new preference key. Restore the previous app and worker versions. Do not drop user data to roll back the visual experiment.
- The user's current request is to review an isolated worktree; do not infer release approval from the existence of earlier broad release authorization.
