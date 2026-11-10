# Journey: globe refinement — 19 October 2026

Scope: approved combination of Little Earth (primary), Pocket World and Small Wins. Candidate `codex/tempo-calm-ui`, base `1f965cc`. This is a UI refinement of the existing account-backed Journey, not a production release.

## Result

- Friendly 3D Earth illustration, consistent dimensional milestone art, editorial headline and warm cream/coral/sage palette.
- Saved streak, distinct active days, total small wins and six cumulative milestones. Future exploration explicitly says Exploring and can return to the earned level.
- Clickable day history, direct map markers, next/previous arrows and all six milestone cards.
- Daily authored Tempo encouragement, finite floating motion, optional celebration, pause and reduced-motion styles.
- Progress display can hide the numbers without hiding the scenery or companion. Preview stays labeled fictional.

## Independent review and iteration

Initial game/UI review: 8.7/10. Fixed mismatched outline reward icons with generated stones/mountain, singular-day wording, mobile visual/DOM focus order, and added visible Ahead/Reached states. Final independent customer review: **9/10**; game/UI review: **9.1/10**. See `customer-review.md` and `game-review.md`.

Both reviewer browser connections were unavailable. Root performed the exact requested CUA interactions; reviewers independently inspected screenshots, recorded results and relevant source. These are agent assessments of this scoped page, not human participant studies or clinical evidence.

## Observed UI evidence

`interactions.json` records six card selections, current/future distinction, direct map → next → previous → return sequence, active/empty day details, repeated celebration without increasing counts, pause retained after Today navigation, hidden/restored progress, rules and sampled keyboard Space activation. Initial First light trace contains the discovered singular grammar error; a later keyboard trace verifies its correction.

- `desktop-refined.png`, `desktop-1440.png`: final desktop composition. The latter used a 1440 × 1024 viewport; content width 1425 after scrollbar.
- `future-milestone.png`: exploring Level 6 leaves earned Level 1 / four wins unchanged.
- `keyboard-focus.png`: visible keyboard outline and updated detail.
- `hidden-progress.png`: counts, markers and milestone list removed.
- `mobile-390.png`: phone layout; viewport 390, document 375, no horizontal overflow.
- `mobile-320-clean.png`, `mobile-320-celebration-viewport.png`: narrow phone; viewport 320, document 305, no horizontal overflow; three map targets 48 × 48 CSS px.
- `mobile-320.png` and `mobile-celebration.png` are superseded full-page captures from a scrolled position. The fixed header/Skip link appears in their middle because of capture/focus position. Clean top and viewport-only captures establish the actual UI; do not treat those two as clean presentation evidence.
- Browser error/warning log query returned no entries. Pause yielded computed Earth animation-name `none`.

## Saved-account check

Isolated local PostgreSQL-backed account **Local QA Alex**, phone ending 0199, at localhost:3101/workspace. Root verified identity in the navigation before the fictional mutation. Baseline: six small wins, one today, two active days, one-day streak. Completing “A five-minute tidy” produced seven wins/two today; full reload retained those values. Unchecking restored six/one, with active days and level unchanged. See `saved-account-evidence.json` and `saved-account.png`. Test-created change was undone. No personal or production records were changed.

## Validation

Nearest Journey/domain/repository tests: **24 passed**, four files. Initial wording assertion failed after shortened text; restored explicit “active days” wording and reran successfully. Final `npm run check`: exit 0. Lint, typecheck, **851 tests passed / 3 skipped** (115 passed / 2 skipped files), Next.js production build and operations TypeScript build all passed. `git diff --check` passed. Log: `check.log` (local, ignored). No assistant-model/provider API calls: **$0**. Built-in asset generation is separate from provider evaluation spending.

## Limits and rollback

No new migrations, API contracts, worker logic or provider changes. No real SMS/Google Calendar verification in this UI pass; broader release gates remain open. Native touch swipes and OS-level reduced motion were not physically exercised; swipe decision rules have unit coverage and reduced motion is implemented in CSS. Full assistive-technology testing remains open. Animation pause lasts during the current workspace session; it is not an account preference. Daily notes are authored copy, not live model output. The globe is rendered art, not a 3D camera scene.

Rollback for this isolated UI change: revert the globe-refinement commit, restoring the prior Journey assets/component/styles. Production has not been touched. New assets total approximately 317 KiB; no new runtime dependency.

## Demo path

Open http://localhost:3101/workspace/preview → Your journey. Explore First light and New horizons, return to your earned level, select a day, celebrate, then pause or hide the numbers. Use a fictional saved local account to demonstrate completion → Journey → reload → uncheck. Preview-only changes reset on reload and do not prove persistence.

Screenshots and raw check logs remain local and are Git-ignored; review reports and JSON observation traces are committed. No release or production-deployment score is claimed.
