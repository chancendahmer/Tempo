# Your journey — October 19, 2026

Candidate `codex/tempo-calm-ui`, PR #26, changes over `a653064`. This is a scoped
optional Today experience, not a production release or a whole-product score.

## Experience

- Today keeps its day view. The right-hand Your journey control opens page two;
  the reverse arrow and Back to my day return. Horizontal swipe handling excludes
  form controls and the interactive map. Keyboard buttons remain available.
- An original illustrated landscape hosts six selectable milestones. Tempo sits
  at the current stop. The next threshold and remaining days are explicit.
- Level 1 is the starting point; subsequent levels require 3, 7, 14, 30 and 60
  recorded active days. Days do not have to be consecutive. The final trail stop
  is level 6; recorded days continue accumulating after it.
- Current streak, best streak, cumulative active days and deduplicated checkoffs
  come from the existing account-scoped completion history. This adds read-model
  totals, not a new write path, points database, migration, or provider request.
- Original daily encouragement rotates by the account-local date. It is authored
  copy, not a live AI response or a quotation attributed to someone else.
- Celebration is optional, decorative, finite, silent, and does not add activity.
  Initial companion motion is finite too. Pause lasts for the open workspace
  session, including section navigation; a full reload resets it. Device reduced
  motion is always respected by CSS. Progress numbers can be hidden via the
  existing saved preference, now reached directly from the Journey page.

## Independent iterations

- [Customer review](customer-review.md): **8 → 9/10**, actual preview interaction,
  desktop and phone-size browser checks, with a second independent hands-on pass.
  Fixed motion resetting on navigation and unnecessary setup steps for changing
  progress display. Reviewer verified Cancel/Save, checkoff counts, milestone
  selection, celebration without inflation and a keyboard activation sample.
- [Game/UI review](game-review.md): **8.5/10** after iteration. Its browser surface
  was unavailable; the reviewer independently inspected saved screenshots,
  prescribed root-operated checks, and used the other reviewer's observed
  interactions. It did not claim its own direct browser session.
- Fixed adjacent mobile hit targets, named the selected stop in its detail panel,
  and kept the page navigation below the sticky header. Root subsequently fixed
  the smallest-screen map caption collision noted as P3 in the game report and
  visually rechecked the fix at 320px (`phone320-caption-final.jpg`).
- These are reasoned agent evaluations, not recruited-customer or clinical studies.

## Account and UI evidence

Root used the authenticated **local synthetic** account Local QA Alex (0199),
backed by the existing isolated PostgreSQL on loopback port 55437. No production
records or provider connections were used.

- Before: 2 total active days, 1-day current/best streak, 6 small wins, 1 today.
- Completed the fictional five-minute tidy through the ordinary Today UI.
- Reloaded: 2 active days, 1-day streak, 7 wins, 2 today. Same-day actions do not
  inflate active days. The completion came from saved account state.
- Unchecked the same step and reloaded: original totals returned. All preexisting
  fixture records remain; the test checkoff was reversed.
- Preview customer test: 4 → 5 wins and 2 → 3 today; 2 active days and 2-day streak
  stayed fixed. Preview clearly states its fictional data resets on reload.
- At 320px: six separate 44×44px node hitboxes, no pairwise overlap, no horizontal
  page overflow. At 390px: selected stop names and remaining-day descriptions are
  readable. Desktop and phone screenshots were captured and visually reviewed.

Screenshots and logs remain ignored local evidence. Key captures include
`account-before.jpg`, `account-after-reload.jpg`, `account-restored.jpg`,
`phone320-final.jpg`, `phone390-final.jpg`, and the customer review's captures.

## Validation and limits

The new cumulative-history regression was first run failing, then passed after
implementation. Targeted suite: 24 tests across activity domain, PostgreSQL-like
repository integration, journey thresholds/quotes/gesture classification, and
server-rendered unavailable/zero/hidden display boundaries.

Full `npm run check` passed: lint, typecheck, 851 tests passed / 3 skipped,
production Next.js build and operations build. No paid API/provider calls in this
pass. The built-in image-generation tool created the project illustration; no
external API key was used for that asset.

After replacing the deprecated Next.js Image priority prop with eager loading,
lint, typecheck, all three Journey view tests and both builds passed again.
The candidate launcher is running locally on port 3101; the final preview is
left on Your journey. `desktop-final.jpg` captures the finished screen.

Native touch-device swipe, OS reduced-motion emulation, full screen-reader audit,
long-term customer response to rewards, SMS delivery, and Google Calendar were
not tested here. CSS reduced motion and pause behavior were inspected; gesture
classification is unit-tested. Existing production release gates remain open.

## Demo

1. Open `/workspace/preview` and choose Your journey at the top right of Today.
2. Select an upcoming map stop; point out that exploring does not earn progress.
3. Return to Today, complete a routine step, reopen Journey and observe one more
   small win, with the same active-day count.
4. Try Celebrate, Pause animations, and How your journey grows → Change progress
   display. Hidden numbers keeps the scenery and encouragement.
5. Use an authenticated local account to demonstrate reload persistence; preview
   itself is deliberately temporary.
