# Tempo sidebar and Today polish — design QA

Date: October 15, 2026. Candidate: codex/tempo-calm-ui, based on 40125df.

**final result: passed**

This accepts a narrow visual refinement, not a new release or an end-to-end readiness rating. The [prior report](../../../qa/today-polish-2026-10-15/prior-design-qa.md) is preserved. Release gates in [UI_RELEASE_CHECKPOINT.md](../../UI_RELEASE_CHECKPOINT.md) remain open.

## Comparison target and evidence

- Source visual truth: [reference-today.png](../../../qa/today-polish-2026-10-15/reference-today.png), copied unchanged from the user's supplied codex-clipboard-13bbe2b7-3df4-48d5-bba9-55b7ac903408.png.
- Implementation: http://localhost:3101/workspace#today, authenticated isolated PostgreSQL account Local QA Alex, phone ending 0199. No personal account was changed.
- Reference: 1107 × 791 pixels. Matched CSS viewport: 1107 × 791, DPR 1. Full-page implementation: [reference-size-fixed.jpg](../../../qa/today-polish-2026-10-15/reference-size-fixed.jpg), 1092 × 1049 pixels. The 15 px width difference is the scrollbar; extra height is actual content. Frames were viewed at matching readable scale, not treated as a pixel-accuracy measurement.
- Desktop CSS viewport after reset: 1625 × 884, DPR 1; document width 1610. [desktop-final.jpg](../../../qa/today-polish-2026-10-15/desktop-final.jpg) is 1610 × 1127 full-page pixels.
- Mobile CSS viewport: 390 × 844, DPR 1. [mobile-routine.jpg](../../../qa/today-polish-2026-10-15/mobile-routine.jpg) is 375 × 1665 full-page pixels. [mobile-navigation.jpg](../../../qa/today-polish-2026-10-15/mobile-navigation.jpg) is 390 × 844 with the navigation overlay open. No density upscaling was performed. Browser captures are JPEG and use the corresponding extension.
- Source state is a fictional Thursday morning with short labels. Implementation state is Thursday afternoon, with longer saved task/routine labels and a disconnected local Calendar. The routine panel is selected manually; the default afternoon panel remains To-do. No fake upcoming events or success notice was added to match the picture.
- Reference and implementation were opened together in the same image comparison input before and after the tablet fix. Full-view comparison covered sidebar, title, current card, routine panel, and composer; all labels were readable, so separate region crops were unnecessary.

## Fidelity surfaces

- **Typography:** Retains Georgia display headings and the existing Manrope interface text. Reduced the oversized desktop day heading slightly, retaining hierarchy and allowing real task titles to wrap. Long labels remain readable on phones.
- **Layout:** Retains the reference's cream canvas, left navigation, timeline/current action, right checklist, and bottom assistant. Four approved groups and the capture/privacy bar intentionally remain. At narrower widths the start controls wrap inside the card; mobile stacks the checklist below the agenda. The composer may be below the initial fold with long content.
- **Color:** Planner is blue, Daily rhythm gold, Food & fitness teal, Brain dump lavender; Today uses coral and Ask Tempo rose. Larger bordered badges distinguish them even when unselected. Today adds colored heading, routine, task, reminder, and Calendar icons. Lavender current action, orange primary button, peach next step, and green completed steps preserve the reference direction. Text and shape accompany color.
- **Assets:** Existing Tempo raster logo and standard Feather interface icons are retained; no custom imitation logo, generated imagery, or decorative photos were added. Captured JPEG softness is not a UI font defect.
- **Content:** Real saved records, clock, routine progress, Calendar availability, account identity, and controls are retained. No invented activity, completed task, or provider connection is presented as real.

## Findings and repair history

1. **P2, corrected: tablet action row overflow.** At 1107 px, the initial [reference-size.jpg](../../../qa/today-polish-2026-10-15/reference-size.jpg) showed “Make it smaller” extending beyond the lavender card. The wrapped action group had no width constraint. The tablet CSS now constrains that group's width and restores the normal layout at smaller breakpoints. [reference-size-fixed.jpg](../../../qa/today-polish-2026-10-15/reference-size-fixed.jpg), captured at the same viewport and selected routine state, shows both actions inside the card. The post-fix comparison has no remaining P0/P1/P2 finding.
2. **P3, optional:** Real labels and the Calendar connection notice create a taller layout than the reference, so the composer sits below the first tablet viewport. The control remains reachable and the dominant action remains visible. Further density tuning is optional.

## Independent review

The release_customer_review agent inspected the reference, desktop/tablet/mobile captures and four-file diff. Score: **8.5/10 for this visual pass only**. No reproducible P1/P2 findings. The reviewer calculated sidebar ink/tint contrast at 5.04–5.98:1 and key secondary/primary-button text near 5:1. Checkbox tick contrast was 4.3:1. Review was screenshot/source based, not an independent backend or assistive-technology test.

## Interaction and technical validation

- Root used the actual browser to switch Routine/To-do, expand earlier agenda entries, open mobile Food & fitness, and navigate to Fitness; the menu dismissed and the destination rendered.
- Keyboard ArrowDown opened Planner and focused its first destination. Escape dismissed it and returned focus to Planner. Evidence: [desktop-planner-menu.jpg](../../../qa/today-polish-2026-10-15/desktop-planner-menu.jpg).
- Browser warning/error log was empty during these checks. The viewport override was reset afterward.
- Nearest Today tests: 15/15 passed.
- Full npm run check: exit 0; lint and typecheck passed; **804 tests passed, 3 skipped** across 106 passed/2 skipped files; production Next.js and operations TypeScript builds passed.
- No paid model calls, provider deliveries, or production mutations were made in this visual pass. Hover handlers were unchanged; touch-style click and keyboard behavior were checked, but no new screen-reader certification or physical touchscreen test is claimed.

## Implementation checklist

- [x] Distinct colors and icons for the four sidebar groups.
- [x] Colored Today/agenda/checklist cues without additional dashboard panels.
- [x] Preserve existing account actions, progress, and navigation.
- [x] Correct tablet overflow and inspect phone/desktop layouts.
- [x] Independent review and complete local validation.
- [x] Keep the production release decision separate from this visual score.
