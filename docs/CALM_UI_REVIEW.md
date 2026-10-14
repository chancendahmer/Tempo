# Calm workspace candidate

2026-10-14 · branch `codex/tempo-calm-ui` · based on merged main `86ae010`.

## What changed

The workspace and room board now share the selected warm ivory/orange visual direction. Today and Ask Tempo remain direct destinations. Four visible groups organize the rest, with one-click links on desktop and a compact two-column phone menu:

- **Planner:** To-do, Calendar, Goals, Reminders.
- **Daily rhythm:** Routines, Sunrise & sunset.
- **Food & fitness:** Meal plan, Recipes, Groceries, Food log, Fitness.
- **Brain dump:** Thoughts, Memories.

Section pills keep their individual color before selection, with a stronger border/underline for the current page. Recipe and grocery views now have their own hashes; previous links remain valid. Goal cards regain illustrated landscape headers. Handwriting remains deferred. The filled-demo follow-up adds workout templates with individual session scheduling; recurring programs and progression tracking remain future work.

Account settings and an optional tour sit at the bottom of navigation. Login/profile/extensions use a matching shell. Original backend APIs, action validation, confirmation gates, provider adapters, and durable state remain unchanged.

The review also produced practical fixes: chronological Calendar ordering, visible compact-screen focus controls, section scroll reset, structured routine editing with stable step identities, conflict recovery without silent overwrite, keyboard dialog loops, recipe date/meal selection, and clear reminder/memory assistant entry points.

## Local review

From this worktree, run `npm ci` and `npm run dev -- --port 3100`, then open `http://localhost:3100/workspace/preview`.

Preview uses fictional in-memory records, resets on reload, and makes no AI, SMS, food-search, or Google calls. Account routes keep their real authentication requirements. Do not use preview success as evidence of live integration behavior.

## Evidence

- `design-qa.md`: reference comparison, fix history, implementation boundaries.
- `qa/calm-ui/customer-review.md`: independent customer-style review and all 19 section scores.
- `qa/calm-ui/43-final-today.jpg`: original iteration desktop overview.
- `qa/calm-ui/44-navigation-goals.jpg` and `45-mobile-navigation.jpg`: latest navigation and goal cards.
- `qa/calm-ui/39-mobile-routine-editor.jpg`: phone routine editor.
- `qa/calm-ui/browser-console-final.json`: fresh browser warnings/errors, empty.

Initial independent UI/preview score: **8.2/10** overall; sections **8.1–8.4**. The subsequent navigation/goal-card review scored **8.4/10**, based on code and screenshots; see `qa/calm-ui/navigation-review.md`. Neither is a commercial-readiness score.

## Actual validation

Final `npm run check` exited 0: lint, typecheck, **90 test files passed, 2 skipped; 668 tests passed, 3 skipped**, production Next build, operations TypeScript build. Nearest workspace suite: **36 tests passed**. The test suite's provider error messages came from mocked regression fixtures.

New tests exercise account-local routine windows, completed/abandoned exclusions, chronological timeline records, ongoing Calendar windows, future-due active tasks, routine focus outside its schedule, step identity/checkmark preservation, and stale/deleted routine recovery.

Browser review covered desktop, phone, keyboard, state changes, empty/missing connections, and foreground light sessions. Live authenticated persistence, SMS/AI/Google, hardware brightness, scheduled alarms, camera scanning, and actual audio remain unverified in this run. Profile and extension styling were not exercised with a live account. No secrets, production data, or live accounts were read or modified.

## Release boundary

This is a separate review candidate. No merge to main or production deployment was performed. Before rollout, verify one authenticated demo account across SMS and dashboard, including a concurrent routine edit, Calendar confirmation, search/scan, session expiry, and mobile login/logout.

## Filled investor-demo follow-up — 2026-10-14

Alex’s preview now contains a coherent student week: 9 tasks, 3 goals, 2 routines, 4 full recipes with local illustrated food images, 21 planned meals, groceries, nutrition estimates, workout history, notes, preferences, reminders and shared sample Calendar events. Fitness adds three templates and six sessions with individual To-do scheduling. Planning does not mark exercise completed or food eaten. Recipe saves navigate to the selected meal date. Sample chat is persistently labeled as scripted; corrected inbound statuses no longer show false pending warnings.

Independent rendered review: **8.3/10**, up from 7.8 after fixes; no remaining blockers for a guided fictional investor demonstration. Read `qa/investor-demo/review.md` and the five-minute walkthrough in `docs/INVESTOR_DEMO.md`. This is not a live integration/commercial score.

Actual validation: full `npm run check` exited 0 with clean lint/typecheck, **91 test files passed, 2 skipped; 674 tests passed, 3 skipped**, production Next build and operations build. After minor final accessibility/date-shortcut styling changes, lint and typecheck passed again and the nearest two test files passed **15 tests**. Parent browser checks verified recipe → selected-date menu, workout → To-do without increasing logged minutes, Today date reset, no mobile horizontal overflow at 390 × 844, and a fresh console without warnings/errors. The reviewer independently tested groceries, routine Undo, sunrise start/end and other sections. Exercise numerals are now explicit `aria-hidden` decoration; the parent’s final AX snapshot has no duplicate numeric labels. A real screen-reader/device audit remains unperformed.
