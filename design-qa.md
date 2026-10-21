# Adaptive Home design QA

Date: 2026-10-21. Branch: `codex/tempo-adaptive-home`, based on `74e9f09fdf1c3697f5200ec572b89344a179f65d`. This report covers the working tree committed with this report, not production.

**Final result: passed** for the requested isolated Home implementation. No open P0/P1/P2 design findings. This is the implementing engineer's visual/interaction QA, not an independent customer score or a full-product release certification.

## Comparison evidence

- Approved image: the user's `codex-clipboard-08a1bd2f-be4d-4063-b163-7fa9d258e2fe.png`, plus its refined morning concept (`exec-f94369be-f176-4cda-90fa-278606c52d6c.png`).
- [Combined source/render comparison](qa/adaptive-home/reference-comparison.png): both images inspected side by side at equal width, including typography, spacing, palette, imagery, and copy.
- [Desktop morning](qa/adaptive-home/morning-desktop.png), [movement](qa/adaptive-home/workout-desktop.png), [dinner](qa/adaptive-home/dinner-desktop.png), [wind-down](qa/adaptive-home/evening-desktop.png).
- [Tablet, 1024 px](qa/adaptive-home/morning-tablet.png), [phone, 390 px](qa/adaptive-home/morning-mobile.png), [narrow phone, 320 px](qa/adaptive-home/phone-320.png).
- Environment: isolated Next development preview, `http://localhost:3103/workspace/preview`. Alex is explicitly fictional, with local temporary changes only.

## Fidelity surfaces

| Surface | Observed result |
| --- | --- |
| Fonts | Manrope, sans headings, strong task names, quiet metadata. Corrected inherited global typography. Task titles increased to 18 px on desktop; narrow-phone titles wrap without colliding with Start. |
| Spacing/layout | Oval header controls, full-width photographic activity banner, stable task/calendar columns, capsule composer. Desktop fits approximately one screen; phones stack naturally. Restored native-dialog centering after a reset stylesheet removed its margins. |
| Colors | White/off-white foundations with restrained teal actions. Gray paperwork, green shopping/food, blue-green activity, and warm routine icons. Next calendar event uses a light blue surface; color is accompanied by text and icon shape. |
| Image quality | New high-resolution ceramic-sun, desk, exercise, evening, and ingredient imagery. Desktop crop preserves the main object; mobile gradients retain legible copy. Matching recipe illustrations appear only for a matching saved recipe; generic food imagery is not presented as the exact user's dish. |
| Copy/content | Real routine titles/next steps, task-specific timer labels, today's actual events, planned servings. Clear empty/error/disconnected states. Demo time and records are labeled fictional. No invented completed activity or nutrition intake. |
| Icons | Consistent React Icons family/weight, category colors restricted to small symbols. The icon's accessible label opens an editable category/timer dialog. Added a permanent accessible name to the mobile-only settings icon. |

Intentional adaptations: the existing Journey link and demo disclosure remain above the Home content. The screenshot's sample events/tasks are replaced by existing account records. Controls and metadata are somewhat denser than the concept to fit these retained elements. A real account is not filled with fictional events to match the picture. No fake attachment or microphone controls were added.

## Interaction and responsive observations

- Changed a task's starting timer to 7 minutes; Start opened a 7:00 focus session. Pausing, resuming, returning Home, continuing, and completing worked. A second task could not start concurrently. Reload reset the fictional preview as advertised.
- Automatic preview time: 08:10 morning routine; 15:05 scheduled walk; 18:00 saved dinner; 21:30 evening routine. Dinner opened the current meal-plan date; movement opened Fitness. Earlier events were absent after they ended.
- Pin/unpin and Home settings worked. Manual banner selection stays a temporary view unless pinned. Search for lemon distinguished dates; choosing October 23 opened that date's meal plan.
- Spaces opened the four groups; Escape dismissed it. Sidebar opened and dismissed with focus returned. Journey remained reachable. Account identity and the preview/account distinction remained visible.
- Inspected 1487, 1024, 390, and 320 px layouts. Corrected the 320 px header wrapping and calendar heading crowding. No horizontal document overflow in final phone/tablet checks. Mobile settings remain scrollable; Escape closes them and returns focus.
- Reduced-motion media rules avoid optional transitions. Focus indicators and native form semantics remain. Final browser console query returned no warnings or errors. A DOM label check's six apparent misses were hidden sidebar buttons with text, not visible unnamed controls.

## Repair history

| Finding | Fix and verification |
| --- | --- |
| P2: global progress margin and typography distorted banner density | Scoped Home progress/typography overrides; re-rendered desktop and tablet. |
| P2: 320 px header forced the profile onto its own row | Compact header spacing and type, remove redundant chevron at this width; final narrow-phone capture. |
| P2: icon-only mobile Home settings lacked an accessible name | Explicit `aria-label`; opened through its accessible name. |
| P2: dialog aligned to the top-left due to global reset | Explicit `margin:auto`; measured centered x=16/y=37 at narrow width, closed with Escape. |
| P2: search meal results did not identify date or navigate to the selected day | Added slot/date labels and selected-date routing; opened October 23 successfully. |
| P3: switching banner could briefly retain the previous photo | Key image by source; inspected different banner states. |

## Validation boundary

Automated account/database tests and the live model check are documented in [the checkpoint](qa/adaptive-home/README.md). Browser QA used the fictional preview, not a signed-in production account. This report does not prove real SMS delivery, Google authorization, worker deployment, or physical-device alarm behavior. Production and the original worktrees were not changed.
