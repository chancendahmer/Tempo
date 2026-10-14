# Tempo calm workspace design QA

Date: 2026-10-14.

**final result: passed**

This accepts the requested visual direction and tested local UI flows. It does not certify live integrations, production reliability, medical effectiveness, or hardware alarms.

## Comparison target and evidence

- Source visual truth: `qa/calm-ui/reference-today.png`, copied unchanged from the user's selected Tempo mockup.
- Original source: `C:/Users/chanc/AppData/Local/Temp/codex-clipboard-67777a1a-7094-4a18-b72e-9d39e758ee67.png`.
- Rendered implementation: `http://localhost:3100/workspace/preview`.
- Final screenshot: `qa/calm-ui/43-final-today.jpg`. Earlier comparison: `35-today-reference-size.jpg`.
- Source pixels: 1487 × 1058. Browser CSS viewport: 1487 × 1058, DPR 1, document client width 1472. Browser screenshot output is 1472 × 1047, apparently scaled to client width. Comparison used the full frames at matched displayed width; the approximately 1% capture-size difference is not treated as design drift or a pixel-accuracy measurement.
- Mobile CSS viewport: 390 × 844, DPR 1, client width 375. Output screenshots: 375 × 812. Compact desktop: 1264 × 712.
- State: light theme, Today, Routine selected, two steps checked. Source shows Thursday morning; implementation shows the actual Wednesday afternoon with fictional preview records, so its current action is a task. Dates, task names, event contents, and unavailable live-event titles intentionally differ.
- Source and implementation were opened together in the same comparison input, first with screenshot 35, then again with final screenshot 43. Full-frame inspection covered the navigation, heading, current card, routine list, and composer. Those regions and their labels were legible at full resolution, so additional cropped images were not needed.

## Fidelity surfaces

**Typography:** Georgia display headings recreate the serif hierarchy; the existing Manrope UI font remains for controls and body text. Titles wrap without clipping. Body text and navigation are more compact than the concept image to accommodate real variable-length content. Inputs remain 16px on phones. Small secondary labels need an eventual arm's-length test on the chosen physical display.

**Spacing/layout:** Four main destinations, a dominant current action, timeline, right-hand routine/to-do panel, and bottom composer preserve the reference structure. The sidebar is 228px instead of approximately 243px. The live product adds a small capture/privacy bar; preview adds an explicit sample-data banner. These intentional additions explain the lower heading position. Mobile stacks the panels and exposes section navigation in two rows. Secondary detail is progressively disclosed.

**Colors/tokens:** Warm ivory, dark plum text, lavender current action, orange primary controls, peach selected navigation, and green checked states preserve the chosen palette. Primary orange is darker than the illustration for readable white button text. Calendar, goals, routines, food, movement, and thoughts have distinct restrained secondary colors. Labels and icons accompany color; color is not the only status cue.

**Assets/icons:** The existing Tempo raster logo is used at its native aspect ratio through WorkspaceAvatar. Feather icons replace only conventional interface icons; no custom imitation logo or generated photo was introduced. Section icons now match their destinations. JPEG evidence is slightly softer than the actual browser-rendered text.

**Copy/content:** Short action labels and ordinary form fields replace pipe-delimited routine instructions. Preview data, unsupported scheduled alarms, sample Calendar connection, and disabled preview AI are disclosed. The app does not claim a save for a preview AI request. Delivered reminders are described as removable rather than offering a nonexistent completion action.

## Findings, fixes, and comparison history

The first customer review was blocked on these actionable issues:

1. **P2 — compact focus controls below the fold.** The first desktop timer capture (02) required scrolling to reach primary actions. Reduced timer dimensions and spacing; final desktop screenshot 42 shows Pause, Done, and extra-time controls within the viewport. Mobile screenshot 20 confirms the same.
2. **P2 — navigation preserved old page scroll.** Screenshot 16/17 showed Settings starting halfway down the page. Navigation now resets scroll; screenshot 36 and DOM scrollY=0 confirm the heading and controls appear.
3. **P2 — excessive mobile navigation height.** Three rows of tabs crowded the first useful content (21/25). Two-row grid and tighter heading spacing are verified in 38/40.
4. **P2 — routine editor required formatting syntax.** Replaced with named steps, minutes, reorder/remove controls, and sticky Save. Screenshot 39 and saved 2-of-5 state verify the revised editor. A native time-field keyboard edit persisted; an automation-only fill discrepancy was not misreported as a product defect.
5. **P2 — misleading or missing entry points.** Added reminder/memory creation and change drafts, corrected reminder copy, and replaced recipe dinner-only saving with date/meal/servings selection. Review verified breakfast planning and explicit draft handoff to the assistant.
6. **P2 — modal keyboard wrap.** A shared boundary handler keeps Tab/Shift+Tab within controls. Both routine and general editors were rechecked in both directions; Escape still dismisses.
7. **P2 — schedule/session accuracy.** Chronological Calendar rendering was browser-verified. Ongoing Calendar windows and future-due active focus sessions now retain precedence in Today; regression tests failed first and pass after fixes.
8. **P2 — routine version conflicts.** A newer or deleted routine disables stale saving inside the editor, preserves the visible draft, and offers explicit discard-and-load recovery. Server 409 refreshes saved state. Rendering tests cover stale, deleted, and current versions; no silent rebase is performed.
9. **P3 — logo aspect-ratio warning.** Intrinsic dimensions fixed the warning. Final fresh console JSON has zero warnings/errors.

The final source/final-screenshot comparison found no remaining actionable P0/P1/P2 visual differences for this requested adaptation. The source is a direction, not a claim of exact pixel identity or identical fictional content.

## Validation and limits

- Independent novice-customer review: **8.2/10** overall UI/preview usability; 19 section scores **8.1–8.4**. Full evidence: `qa/calm-ui/customer-review.md`.
- Final `npm run check`: lint, typecheck, 668 passing tests / 3 skipped, Next production build, and operations build passed.
- Nearest workspace tests: 36 passed.
- Browser interactions include task/goal creation, completion, focus start/pause/done, routine step edits/reordering/checkmarks, meal/recipe planning, groceries, manual/recent food logging, movement logs, thoughts-to-tasks, memory/reminder removal, privacy, tour, navigation, and keyboard dialogs.
- No live SMS, AI, Google authorization/read/write, authenticated persistence, barcode camera, audio audibility, screen brightness hardware, or wake-from-sleep validation. No physical touchscreen, screen-reader session, or full WCAG audit.
- Foreground sunrise/sunset sessions are available. Reliable scheduled hardware alarms remain future work.

## Implementation checklist

- [x] Reference-based app structure and responsive section themes.
- [x] Fix and independently recheck actionable customer findings.
- [x] Preserve existing API paths, consent choices, and backend confirmation boundaries.
- [x] Run full repository checks and record actual results.
- [x] Preserve old UI in the original checkout; isolate this branch/worktree.
- [ ] Before production rollout, test the new UI with authenticated fictional accounts against real persistence and integrations.

## Follow-up polish

P3: test secondary-label readability at the actual wall-monitor viewing distance; recruit people with different sensory and executive-function preferences; consider a user-controlled larger-text density. These require real-user/device evidence rather than another simulated score.
