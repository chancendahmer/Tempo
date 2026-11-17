# Tempo mobile pilot review

November 17, 2026 · `codex/mobile-experience` · [PR 33](https://github.com/chancendahmer/Tempo/pull/33)

The independent mobile designer rated the experience **9.1/10** across 25 screens, with scores from **9.0 to 9.3**. Two more authenticated screens received a separate visual review. These are agent evaluations of running software. A simulated commuter, shift worker, easily interrupted note taker, first-time cook and gym beginner provided task-based feedback. A separate reviewer checked the desktop layout. No human pilot satisfaction score has been collected.

| Area | Final simulated customer scores |
| --- | --- |
| Planning | Today 9.1 · To-do 9.2 · Calendar 9.0 · Goals 9.1 · Reminders 9.0 · Focus 9.3 · Journey 9.1 |
| Daily rhythm and capture | Routines 9.2 · Sunrise / sunset 9.1 · Thoughts 9.2 · Memories 9.0 · Ask Tempo 9.0 |
| Food and fitness | Recipes 9.2 · Meal plan 9.2 · Shopping 9.1 · Pantry 9.1 · Nutrition 9.1 · Fitness 9.2 |
| Setup | Settings 9.1 · Personalization 9.2 · Workspace guide 9.0 · Public signup form 9.0 |

The separate signed-in visual review scored Profile **9.1** and Extensions **9.2** at `eba7af4`. Profile previously scored **7.8**. The team reduced the identity panel from about 500 pixels in height and removed redundant navigation. Both editable fields became visible on a 390px phone.

The [independent design scorecard](professional.md) has a separate score and observed interaction for each screen, including Spaces, login, pricing and How it works. Each score describes the interaction that reviewer exercised.

## What changed after testing

- Choosing a future meal date had also advanced the food and exercise diaries. A tester planned dinner eleven days ahead, switched to each diary, logged a meal and a walk, then returned to the original dinner. Each section kept the correct date.
- Pantry stock and fitness programs took multiple screens of scrolling to find. Both now have direct switches. A tester followed lentils from recipe to shopping to pantry and verified that recording 50 g of stock reduced the remaining shopping quantity by 50 g.
- Evening routines were hard to reach after a shift. The phone now opens the relevant period and lets users switch immediately. The editor keeps an explicitly chosen start time. Extending a paused focus timer also preserves the pause.
- Mobile screens give the task, illustration or food photo more room by removing repeated titles and shortening controls. Spaces and the optional assistant stay one tap away. Signup shows consent before the submit action.

## Evidence

- [Commuter and planner walkthrough](rhythm/planner-cross-review.md) · [Planner before and after](planner/review.md)
- [Daily rhythm, notes, setup and accessibility](rhythm/review.md) · [Independent customer retest of food, fitness and signup](customer.md)
- [Food and fitness before and after](food/review.md) · [Desktop regression at 1280 × 900](desktop.md)
- [PostgreSQL persistence, concurrent use and account isolation](persistence.md)
- [Signed-in task after reload](lead/signed-task-after-reload.png) · [Second account's empty To-do view](lead/separate-account-empty.png) · [Signed-in coaching preference](lead/profile-final.png)

The lead used two loopback-only fictional accounts on a separate instance of Tempo backed by PostgreSQL. Rowan saved “Pack the orange sketchbook” in the phone UI and reloaded. The task appeared in both the Today banner and to-do list. Rowan also saved a coaching preference and verified it after a reload. Jules's All view showed zero open tasks. Signing back in as Rowan restored the original task and preference. After logout the workspace required sign-in. A local helper issued these test sessions through Tempo's token redemption service. This exercise did not send a login text.

Browser testing used 320, 375 and 390 CSS-pixel phone widths. The Alex preview uses fictional, temporary state. Separate tests used local PostgreSQL and synthetic accounts. The default `npm run check` on final application commit `eba7af4` passed lint, typecheck, 1,469 tests and the production builds, with 12 tests skipped under that configuration. The isolated PostgreSQL run enabled five database suites and passed 14 tests, including 20-account concurrency. The two counts have overlapping coverage.

This pass did not verify a physical iPhone, VoiceOver, the iOS keyboard or camera, carrier delivery, live AI responses, or Google OAuth. The candidate should receive a real-device and live-provider smoke test before rollout.

## Remaining release checks

1. On an iPhone in Safari, create and rename a task with the keyboard open. Confirm Save stays reachable, then pause a timer, background Safari and return. Use VoiceOver to open Spaces, select Nutrition and dismiss the food-entry sheet.
2. From the dedicated demo number, text Tempo to add a clearly named task. Confirm it arrives in the same signed-in phone workspace after refresh. Complete it in the browser and ask for the current task list by text.
3. On the demo Google account, connect Calendar, check that today's event appears, and exercise the existing confirmation flow for one fictional event. Verify a scheduled test reminder actually reaches the demo number. Check camera permission denial and manual barcode entry on the handset.
