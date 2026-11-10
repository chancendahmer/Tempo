# Independent UI review — Tempo preview

Date: 2026-10-18. Candidate: `http://localhost:3101/workspace/preview`. Reviewer did not implement this UI.

## Scope and evidence

This is an independent visual and source review of the integrated preview, using screenshots captured by the main browser reviewer during this run. The review agent's CUA connection reported no available browser, so it did not perform independent live interactions. The main reviewer explicitly supplied the saved screenshots and interaction results for this review. Browser checks attributed below are that reviewer's observations, not tests run by this agent. No real account or provider behavior is assessed.

The preview declares fictional data, reset on reload, and no messages sent. All accepted screenshots were opened and visually inspected. `review-01-today.jpg` is an unchanged copy of `02-first-pass-today.jpg`, retained under the independent review prefix; it is not a separate browser capture.

## Findings and repairs

1. **Repaired: secondary sidebar text contrast.** Original `.groupLabel` used `#817a71` on `#f7f6f3` (3.92:1), and account secondary text used `#76716b` (4.47:1). Both were normal-sized text below 4.5:1. Main implementation changed both to `#716b63`. Independent source recheck and sRGB contrast calculation give approximately **4.88:1**. This only verifies those declared colors; it is not a full contrast audit.
2. **Repaired: destination focus transfer.** Originally `go()` changed the page while `navigate()` restored focus to the group trigger. The main implementation added focus transfer to named `#workspace-content`; independent source inspection confirms it. Main reviewer reports actual focus on named `main` after desktop Fitness/To-do navigation and mobile Nutrition selection. Main reviewer also found and repaired a mobile visibility-transition focus issue, then reloaded and verified drawer focus behavior described below. This resolves the concern within those observed cases.
3. **Improved, nonblocking density tradeoff remains: Routines vertical hierarchy.** The original capture's redundant section heading was removed in [the final Routines capture](17-routines-final.jpg). Instructions are clearer and cards appear sooner. First routine steps still begin below the 712px fold. Further compacting introductory spacing would aid rapid step execution, but Today already exposes steps and this is not a blocking defect.
4. **Nonblocking polish: repeated Goals illustration.** Adjacent goal cards repeat the same large hill image. It creates visual warmth but consumes space without distinguishing goals. A shorter illustration band would surface titles and progress sooner. This is a design tradeoff, not a functional defect.
5. **Repaired: Ask composer below the first desktop viewport.** In `12-assistant-desktop.jpg`, the usable writing field/Send control were below the 712px fold. Current source constrains conversation height and lets message history flex inside it. Independent visual inspection of [final desktop Ask](16-assistant-desktop-final.jpg) at 1265×712 and [final mobile Ask](15-assistant-mobile-final.jpg) at 390×844 confirms recent messages, composer, Send, and scripted-conversation guidance are visible together. This resolves the captured visibility issue; it does not validate live AI replies.

## Visual coverage

| Step | Surface and evidence | Health and observation |
| --- | --- | --- |
| 1 | [Today](02-first-pass-today.jpg) / [review copy](review-01-today.jpg) | Strong. Neutral sidebar, clear current section, dominant current action, and accessible-looking routine checklist. Earlier schedule is collapsed. No clipping visible. |
| 2 | [Food & fitness flyout](03-navigation-flyout.jpg) | Strong. Group title, consistent icon alignment, large labeled destinations, restrained shadow. Pointer crossing and keyboard operation cannot be established by this image. |
| 3 | [Nutrition](04-nutrition-desktop.jpg) | Strong first viewport. Selected group and section are clear; date strip and primary food action have distinct roles. Sample estimate disclosure is visible. Totals correctness is outside screenshot evidence. |
| 4 | [Meal plan](05-meals-desktop.jpg) | Strong first viewport. Date navigation, plan action, and meal categories are easy to scan. Food photos remain secondary to the date/action hierarchy. |
| 5 | [Fitness, full page](06-fitness-desktop.jpg) | Strong. Summary, completed movement, saved plans, template choice, and selected session form a coherent sequence. Actions distinguish scheduling from completion. Long page remains orderly. |
| 6 | [To-do](07-todo-desktop.jpg) | Strong first viewport. Selected view, task count, add action, grouped rows, and focus controls are clear. No clipped row controls visible. |
| 7 | [Goals](08-goals-desktop.jpg) | Good first viewport. Selected section, in-progress/achieved choice, and creation action are clear. Repeated illustration is an optional density improvement. |
| 8 | [Routines, initial](09-routines-desktop.jpg) / [final](17-routines-final.jpg) | Good first viewport, improved in final. Redundant heading removed; morning/evening distinction and routine states remain clear. Steps still require scrolling at the captured height. |
| 9 | [Sunrise & sunset](10-wake-desktop.jpg) | Strong first viewport. Sunrise versus Sunset selection is visible through border, tint, text, icon, and selection mark. Duration controls begin below the fold; actual light/audio behavior was not independently exercised. |
| 10 | [Brain dump / Thoughts](11-thoughts-desktop.jpg) | Strong first viewport. Selected group and subtab are clear; a prominent capture action and readable saved notes support quick recognition. |
| 11 | [Ask Tempo, initial](12-assistant-desktop.jpg) / [final desktop](16-assistant-desktop-final.jpg) / [final mobile](15-assistant-mobile-final.jpg) | Strong after repair. Composer and Send are visible together with recent messages at both captured sizes. The scripted-example label clearly distinguishes preview content. |
| 12 | [Mobile navigation](13-mobile-menu.jpg) | Strong visible drawer state. Label hierarchy, close button, large rows, selected Ask destination, and dimmed background are clear. Interaction behavior is not established by this image alone. |
| 13 | [Mobile Nutrition](14-mobile-nutrition.jpg) | Strong visible reflow. Current Nutrition subtab is fully visible; date, entry actions, week strip, and calories fit without overlap. Top capture button wraps but remains readable. This image does not establish zoom or horizontal-overflow measurements. |

## Navigation and motion source review

The four groups retain stable order. Buttons have explicit labels; destinations expose `aria-current="page"`; group triggers expose `aria-expanded` and `aria-controls`; collapsed panels use `hidden`. ArrowDown/Right opens a group and requests first-item focus. The panel supports ArrowUp/Down and Home/End. Escape closes the group before the mobile drawer's Escape handler runs. A visible focus outline is declared. These are source findings, not independent live keyboard results.

Navigation color/opacity feedback and small flyout entrance effects are declared only under `prefers-reduced-motion: no-preference`. The mobile drawer has an explicit close button and the source traps visible navigation controls while the drawer is open. The page uses `inert` for the main content during that state. Source review supports intent; supplied focus-trap observations are recorded separately below. Actual motion, assistive-technology announcements, zoom, and pointer-gap behavior remain unverified here.

## Browser interaction results supplied by the main reviewer

These are actual browser observations reported by the main reviewer, not independent replay by this review agent:

| Check | Reported outcome |
| --- | --- |
| Desktop group ArrowDown / ArrowRight | Opens the group and focuses its first destination. |
| Planner End | Focus moves to Reminders, the last destination. |
| Planner Escape | Flyout closes and focus returns to Planner. |
| To-do Enter | Destination opens and focus moves to `main` labeled To-do. |
| Mobile drawer open, after repair and reload | Focus begins on Close menu. |
| Mobile Shift+Tab from Close menu | Wraps to Guide. |
| Mobile Tab from Guide | Wraps to Close menu. |
| Mobile Escape | Drawer closes and focus returns to Open navigation. |
| Mobile Nutrition selection | Drawer closes; named main receives focus; selected tab is fully visible at x=121–271 in a 390px viewport; no page horizontal overflow reported. |

No claim is made that Home, every arrow on every group, hover-gap crossing, screen-reader output, or all fictional edit/save paths were independently exercised. Earlier static-source descriptions should not be confused with these observed cases.

## Score and remaining verification

**Final scoped visual polish score: 8.7/10** for the supplied integrated desktop captures, with mobile navigation/Nutrition/Ask checks as supporting evidence. Contrast, destination orientation, and Ask composer findings were addressed. This is an independent design judgment of this preview, not a whole-product score, release approval, or backend/safety score. The remaining density opportunities are optional polish. Interaction usability is not separately scored because this agent could not replay the flows independently.

Remaining unverified in this report: Memories' dedicated page, Home key and exhaustive per-group keyboard paths, pointer hover-gap behavior, fictional save/edit outcomes, 200% zoom, actual reduced-motion rendering, screen-reader announcements, and real-account/provider behavior. The main reviewer may append further save-flow evidence separately. No release-readiness conclusion follows from this review.
