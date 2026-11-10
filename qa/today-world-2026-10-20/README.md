# Today visual experiment — 20 October 2026

## Scope

Local branch `codex/tempo-today-world`, based on `db2abde` from `codex/tempo-calm-ui`. Only Today's presentation and its motion-control wiring change. This experiment is not pushed, merged, or deployed. It must be reviewed by the user before publishing.

## Design direction

Carry the approved Journey page's soft 3D artwork, cream foundation, serif headings, sage progress and coral actions into the daily workspace. Keep the agenda, next action, routine/to-do switch, calendar connection states and existing account action callbacks. The new garden is decorative; it does not imply a new game mechanic, earned reward or real weather.

## Browser evidence

Environment: local Next.js candidate at http://localhost:3102/workspace/preview, fictional Alex fixture. Changes reset on reload. No provider messages, personal-account records or Calendar writes were used.

Observed interactions:
- Switched Routine / To-do; each checklist rendered.
- Completed a routine step: 2/4 became 3/4, and sample completions changed from 2 to 3. Undo restored both.
- Started the selected 15-minute task, paused it, returned to Today, reopened the same paused focus session, then stopped it. No second focus session was created.
- Paused Today animation, moved into Journey and observed its matching disabled-motion state, then returned.
- Expanded the seven-day progress details on a phone-width viewport.
- Followed setup from Today, selected 'Keep numbers out of it', saved, and observed the streak card disappear. Reload restored the documented sample fixture.
- Verified desktop plus 390px and 320px layouts. Corrected title/art overlap on narrow screens.

The animation is finite and has a pause control. CSS explicitly honors prefers-reduced-motion; OS-level reduced-motion emulation was not available in this browser session.

These are UI-preview observations, not new proof of production persistence, SMS delivery or Calendar integration. The underlying action handlers and repositories are unchanged.

## Local preview

From this worktree: `node qa/today-world-2026-10-20/start-today.cjs`.

The launcher refuses populated environment files, supplies a filtered synthetic local environment, disables autonomous sending, and listens only on 127.0.0.1:3102. Do not use the optional signup stub for this visual review. The existing UI worktree is separate.

## Validation

- Focused Today / Calendar connection / Journey tests: 28 passed.
- Lint and typecheck: passed (test fixtures updated to pass the shared motion props).
- Full `npm run check`: passed; 851 tests passed, 3 skipped; production and operations builds passed. See local check.log.

## Assets

`public/images/today-garden.webp` was generated with the built-in image tool. The complete prompt and style-reference provenance are in `public/images/today-garden.source.md`. Existing Journey flame, sun, sprout and Tempo mascot images are reused.
