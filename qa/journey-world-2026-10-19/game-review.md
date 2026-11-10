# Globe journey: independent game/UI review

Date: 2026-10-19. Final score: **9.1/10** for the refined globe-first fictional preview. **No remaining must-fix issue found in this review’s scope.**

Reviewed candidate: current uncommitted JourneyView/CSS/assets on base HEAD `1f965cc`. Approved visual grounding: `exec-f11f030d-46d7-450d-a4b6-ee512f5841f3.png`. No source files were modified by this reviewer.

## Method and evidence limits

My fresh CUA inventory exposed no browsers/apps, and creating browser2 without visibility options failed. I therefore prescribed specific tests for root’s working CUA browser, independently inspected the resulting saved captures and the actual DOM-derived trace in `interactions.json`, and reviewed the named source. This is **independent evaluation of reviewer-directed, root-operated interaction evidence**, not my own hands-on browser operation. The limitation is material and must accompany the score if the review is summarized.

The score covers the observed resetting fictional preview and inspected UI/model semantics. It does not certify production persistence, live account behavior, screen-reader compatibility, full keyboard traversal, real-device touch/swipe, OS reduced-motion emulation, or long-term motivation outcomes. No live/personal writes or paid provider calls were made by this reviewer.

## Why 9.1

The globe is now the page’s clear identity, with a cohesive dimensional illustration family, a legible editorial headline, a recognizable Tempo companion, and a restrained coral celebration action. It feels inviting without creating a compulsory engagement task. The desktop composition and narrow layout both preserve the approved globe-first direction.

The game rules are honest: exploring a future milestone does not claim it, cumulative activity days remain distinct from streaks and wins, inactive days are not disguised, and repeated celebration does not increase progress. Selection, return-to-earned-level, day details, pause, progress hiding and rules all have actual observed outcomes. The calm numbers-hidden version is a complete alternative, rather than a dead end.

The first observed desktop candidate was an interim **8.7/10**. It rose to 9.1 after the concrete artwork, status, copy, focus-order and local-feedback fixes below. This is not a score assigned to meet the requested threshold. It is not a 10 because the review is limited to representative preview states and sampled browser accessibility behavior rather than a complete real-device/accessibility or longitudinal study.

## Flow steps and health

1. **Enter Journey and understand progress — healthy.** The optional Today/Journey control, sample account banner and sample journey eyebrow are visible. The initial summary shows a 2-day streak, 4 small wins, 2 today, actual Level 1, and 2 active days with one more day to First light. Desktop evidence: `desktop-1440.png`, `desktop-refined.png`.
2. **Explore all six milestone cards — healthy.** Root clicked all six cards. Details correctly distinguish the starting point from ahead states; required additional days are 1, 5, 12, 28 and 58. The three nearby globe markers update to the explored range. Previous is disabled at the first milestone, Next at the last. `future-milestone.png` shows Exploring Level 6 while the actual summary stays Level 1. Evidence: `interactions.json`, `future-milestone.png`.
3. **Use direct markers, arrows and return — healthy.** A direct globe Level 2 marker click produced First light; Next produced Level 3/Finding your feet; Previous returned to Level 2; Return restored actual Level 1. Final metrics remained 4 wins, 2 active days, 2-day streak. Actual click sequence is recorded at the end of `interactions.json`.
4. **Inspect recent days — healthy.** Selecting Sunday reports 2 saved checkoffs; Tuesday reports 0. Empty days remain neutral. This provides meaningful detail without inventing credit. Evidence: `interactions.json`, `celebration-paused.png`.
5. **Celebrate and pause — healthy.** Root paused and celebrated twice. The status acknowledged 4 little wins while totals remained unchanged. Pause survived Back to Today and Journey re-entry; computed animation was `none`. A clean 320px viewport capture shows the celebration status beside the action, so phone feedback does not depend on the globe being on screen. Evidence: `celebration-paused.png`, `mobile-320-celebration-viewport.png`, `interactions.json`.
6. **Hide numbers, restore them and read rules — healthy.** Hiding progress removes map markers and numerical systems while keeping globe, encouragement and a clear return/display action. Restoring progress restores three globe markers. Expanded rules explain one active day per local day, distinct small wins, repeated-checkoff deduplication, cumulative thresholds, breaks, undo, timezone, history coverage, fictional reset behavior and authored encouragement. Evidence: `hidden-progress.png`, `interactions.json`.
7. **Use responsive layout and sampled keyboard activation — healthy in observed checks.** Both 390px and 320px clean captures are coherent with no horizontal overflow. Trace reports client/scroll widths equal at both sizes and globe targets 48×48px. Narrow cards wrap text without cutting it off. Space activates First light and shows a clear 3px blue focus ring; a 320px keyboard run produces the same singular detail. DOM order now places world before summary/companion, matching the phone’s visual order. Evidence: `mobile-390.png`, `mobile-320-clean.png`, `keyboard-focus.png`, `interactions.json`, current JourneyView source.

## Concrete issues resolved during review

- Two thin outline reward icons broke the dimensional milestone family. Refined captures now show real dimensional stones and mountain artwork for those milestones.
- Milestone cards now visibly say Start here, Ahead or Reached rather than relying only on color or a threshold number.
- The First light detail’s “1 more active days” regression is corrected. The latest keyboard and direct-map traces show “1 more active day.”
- The mobile world was initially visually moved above summary/companion while remaining later in DOM order. World JSX is now immediately after the heading, removing the avoidable focus-order mismatch.
- Mobile celebration now has local status feedback beside the button, in addition to any globe effect.
- Globe mascot sizing and heading typography were refined; the final desktop captures show the intended serif heading and a compact marker companion.

## Screenshot acceptance

Independently opened and accepted: `desktop-initial.png` (initial comparison), `future-milestone.png`, `desktop-refined.png`, `desktop-1440.png`, `keyboard-focus.png`, `hidden-progress.png`, `celebration-paused.png`, `mobile-390.png`, `mobile-320-clean.png`, and `mobile-320-celebration-viewport.png`.

Rejected `mobile-celebration.png` as clean visual evidence because full-page capture while scrolled placed the sticky header/Skip link midway over content. Root replaced it with the accepted viewport-only celebration screenshot and top-origin clean 320px full-page screenshot. This was treated as a capture artifact, not asserted as an application defect.

## Remaining verification limits

Native swipe, full Tab traversal, a screen reader, OS reduced-motion emulation and live durability remain unverified here. The CSS device reduced-motion guard was inspected; the runtime pause path was observed. The source retains the saved-activity model, but this UI score does not substitute for domain/repository tests. No claim of full WCAG compliance or proven behavioral benefit is made.

No additional game systems are needed to reach the current quality threshold. Keep rewards tied to recorded actions, preserve the nonpunitive cumulative model, and keep the numbers-hidden option complete.
