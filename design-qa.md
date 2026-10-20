# Today experiment — visual QA

final result: passed

## Scope and comparison

This is a local design experiment for **Today only**, based on the approved Journey aesthetic. It is not a release approval or a claim of whole-product readiness. The user requested an adaptation, so the daily agenda and checklist intentionally replace Journey's large map and milestones.

Source visual truth:
`C:/Users/chanc/.codex/worktrees/tempo-calm-ui/Agentic AI Assistant SMS/qa/journey-world-2026-10-19/final-desktop.png`

Implementation:
`http://localhost:3102/workspace/preview`

Final evidence:
- `qa/today-world-2026-10-20/final-desktop.png` — 1265 × 1404 pixels, full document at 1280 × 720 CSS viewport, device scale 1. Scrollbar excludes 15px from the captured document.
- `qa/today-world-2026-10-20/final-mobile-390.png` — 375 × 2330 pixels at 390 × 844 CSS viewport, device scale 1.
- `qa/today-world-2026-10-20/final-mobile-320.png` — 305 × 2505 pixels at 320 × 800 CSS viewport, device scale 1.
- `qa/today-world-2026-10-20/before-desktop.png` — earlier Today design.

State: fictional Alex preview; current local Tuesday; routine checklist selected for final screenshots. The afternoon next task and event times remain sourced from the existing fixture/model. No fake completed activity was introduced. Screenshots are local QA artifacts and are not committed.

The approved Journey source (1265px-wide document) and final Today capture were opened together in one comparison input at native 1x document scale. They are different page contents by design. The existing Today capture anchors layout continuity; Journey anchors typography, color and artwork. Phone captures were opened together for the responsive pass. At these native captures, headings, card text, image edges and controls were readable, so separate cropped comparisons were unnecessary.

## Fidelity surfaces

- **Typography:** Georgia display headings echo Journey; Manrope remains on controls and dense task content. Higher-specificity Today selectors preserve the serif headings in both development and production builds. Long task titles wrap without truncation.
- **Layout:** Compact illustrated welcome area, clear divider, dominant next-action card and adjacent checklist. The garden was reduced to keep the sample primary focus button within the 1280 × 720 viewport (bottom 714px). Small phones use a vertical flow. No horizontal overflow observed at 390px or 320px.
- **Colors:** Warm cream, coral action, sage checklist and muted calendar blue carry the Journey palette while preserving readable task categories. Only Today styles change.
- **Images:** Generated transparent garden follows the approved soft clay world; existing flame, sun, sprout and mascot are reused. Clean alpha, no missing images, no stretched artwork, no rasterized UI. Text and controls remain real HTML.
- **Copy:** Short supportive wording; actual date/time and account-derived counts; preview label remains visible. No marketing claims, fabricated achievements or hardware promises.

## Comparison history

1. **P2, phone title/art collision:** initial 390px capture (`mobile-before-fix.png`) placed the garden over the end of the title. Reserved separate title space, reduced mobile type/art and removed the secondary tagline on phones. Final 390px and 320px captures show clear separation.
2. **P2, desktop hero density:** first draft pushed the focus action below a short desktop viewport. Reduced artwork width and welcome-card height while preserving the main visual. Final production-build capture and DOM geometry confirm the focus button is fully visible at the tested desktop size.
3. Final full-view and phone comparison: no remaining actionable P0/P1/P2 issue within this Today experiment.

## Interaction and technical validation

Observed in the browser: Routine / To-do switching; step completion and undo with matching progress; task focus start, pause, return and reopen; Journey navigation; Today animation pause shared with Journey; seven-day details; setup and hiding the streak display. Repeated routine completion/undo on the production build. Paused state computed styles report no running animations inside the Today header. Reduced-motion CSS is present; OS-level preference emulation was not run.

- Focused tests: 28 passed.
- `npm run check`: passed. 115 test files passed, 2 skipped; 851 tests passed, 3 skipped. Lint, typecheck, Next production build and operations TypeScript build passed.
- Production-build browser console: no captured error/warning entries on final inspection.
- `git diff --check`: passed.
- No paid provider tests, production writes, deployment or push in this run.

The inherited tests validate code paths. Browser checks used the fictional preview; they do not establish new real-account persistence, SMS delivery or Google Calendar evidence. Those subsystems were not changed.

## Follow-up polish and feedback

- At 320px, long agenda titles make the later cards closely spaced; this is a minor visual refinement, not an inaccessible action or clipped content.
- The garden is a rendered illustration with restrained CSS motion, not an interactive 3D model.
- The user should judge the visual direction before any extension to other sections or publication.

## Local checkpoint

Branch: `codex/tempo-today-world`, based on `db2abde`.
Worktree: `C:/Users/chanc/.codex/worktrees/tempo-today-world/Agentic AI Assistant SMS`.
Run the built preview with `node qa/today-world-2026-10-20/start-today.cjs --production` after `npm run build`; omit `--production` for editing. Port 3102 is local only and autonomous sending is disabled.
