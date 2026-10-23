# Your journey: independent game/UI review

Date: 2026-10-19. Final score: **8.5/10** for the fictional preview experience after iteration.

## Scope and method

Reviewed the optional Your journey page for progression clarity, encouraging reward mechanics, desktop/mobile presentation, milestone selection, celebration, pause, return navigation, sample-data honesty, and sampled keyboard access. No source files were edited by this reviewer.

My own CUA session exposed no browser surfaces, including after retrying the working root browser ID without visibility options. I therefore prescribed a test sequence for root to operate in its working CUA browser, independently inspected the saved screenshots, and cross-checked observations from the independent customer reviewer’s working browser. This is **reviewer-directed, root/customer-operated interaction evidence**, not my own hands-on browser session. I did not use another browser automation technology as a workaround.

## Overall judgment

The map gives earned effort a pleasing sense of place, and the Tempo companion gives it warmth. Current position, future stops, the next threshold, and cumulative active days are understandable. The streak is secondary; missed days do not remove earned days. The optional numbers-hidden state preserves a useful calm page. The interaction loop is modest and healthy: real recorded task/routine checkoffs update progress, selecting a node explains a destination, and celebration acknowledges wins without manufacturing progress.

I would use this as an optional reflection page. The remaining limits are polish and verification depth, rather than a broken core experience. It earns 8.5 because the visual map and gentle mechanics are strong, the important mobile defects were corrected, and observed actions preserve the count rules. It is not a 10: this is a six-stop recognition trail with limited reward variety, and native touch, full keyboard traversal, screen readers, and live durable account behavior were not verified in this review.

## Steps and health

1. **Enter from Today — healthy.** The two-page control gives Journey a discoverable, optional home and a clear Today return. Desktop evidence: `desktop-first.jpg`; updated mobile page controls: `phone390-final.jpg`.
2. **Read the map and next milestone — healthy.** Current position uses the Tempo avatar and a distinct current node; future nodes remain selectable. Two cumulative active days require one more day for First light. Actual 390px future selection shows New horizons and 58 more active days. Evidence: `desktop-first.jpg`, `phone390-final.jpg`.
3. **Select a milestone — healthy after fix.** Selected nodes show an outline and an explicit stop name in the detail. Mobile Level 3 selection shows Finding your feet and five more active days; Level 4 keyboard selection shows The open trail and twelve more days. Selection does not alter the totals. Evidence: `customer-11-recheck-phone.jpg`, `customer-12-keyboard-phone.jpg`.
4. **Record a preview checkoff and celebrate — healthy in observed preview.** Customer-operated test: wins rose 4→5 and today’s completions 2→3; active days and streak stayed at 2. Paused celebration announced five little wins and left totals unchanged. This correctly distinguishes multiple checkoffs from a new activity day. Earlier captured celebration evidence: `customer-03-celebrate-paused.jpg`; updated five-win state: `customer-11-recheck-phone.jpg`.
5. **Pause and return — healthy after fix.** Pause changed to Enable animations and remained checked through returning to Today, a routine checkoff, and navigation through Calendar. A numbers-hidden state keeps the landscape and encouragement while removing levels/streaks. Evidence: `customer-10-paused-after-section-navigation.jpg`.
6. **Use phone layout and keyboard — healthy in sampled checks.** Independently inspected both 320px and 390px captures. Root’s read-only DOM measurements at 320px found all six node buttons 44×44px, inside the viewport, with no pairwise rectangle overlap. Document width was 305px inside a 320px viewport with a 15px scrollbar. Customer reviewer activated Level 4 using Space and captured a clear blue focus outline. Evidence: `phone320-final.jpg`, `phone390-final.jpg`, `customer-12-keyboard-phone.jpg`.
7. **Understand the rules — healthy.** Expanded rules distinguish cumulative active days, small wins, and consecutive streaks; explain the timezone, undo behavior, history limits, and authored encouragement; explicitly label fictional preview progress and reset behavior. Evidence: `customer-08-phone-clear.jpg` (initial rule-copy capture), with named source inspection confirming the current semantics.

## Iteration and remaining issue

- **Resolved: overlapping mobile stops.** The original phone layout crowded levels 4 and 5. Updated responsive positions show separate visible nodes; root’s 320px measurement confirms separate 44px hit targets.
- **Resolved: selected-name clarity.** Phone map labels are hidden, so a selected destination now has its actual stop name in the detail heading.
- **Resolved: pause persistence.** Updated interaction evidence shows the pause survives Today and section navigation.
- **P3 polish: map caption at 320px.** Level 5 partially obscures the Sample portion of the decorative map caption in `phone320-final.jpg`. Keep the Sample tag visible by shortening/hiding the long trail title on the smallest breakpoint. The page-level fictional preview banner also exists, so this does not invalidate the observed progress semantics or block the score.

## Accuracy and accessibility limits

- No live account, paid provider call, or durable production completion was used. Count behavior was exercised in explicitly fictional resetting preview state. Domain/repository source inspection supports the saved-completion design; production persistence is outside this game/UI score.
- Native swipe was not performed. Gesture source logic supports an 80px predominantly horizontal movement and excludes controls/map; runtime touch-device behavior remains unverified.
- The actual browser reported `prefers-reduced-motion: false`. The reduced-motion CSS rule was inspected but OS preference emulation was not available; no claim that an emulated reduced-motion run passed.
- Keyboard evidence covers Space activation and visible focus for one selected milestone. It is not a complete Tab-order or screen-reader audit. No WCAG-compliance claim.
- Daily encouragement uses an account-local day and authored copy according to source inspection; no live AI generation was claimed.

## Official pattern research and constraints

- [Duolingo home-screen path](https://blog.duolingo.com/new-duolingo-home-screen-design/): guided nodes clarify the next step, preserve earned progress, and expose a topic when selected. Tempo inference: retain earned milestones, identify the current/next position, and make node detail meaningful.
- [Finch goal completion](https://help.finchcare.com/hc/en-us/articles/37779940291213-Creating-and-Completing-Goals): marking a goal complete earns energy or stones and contributes to pet growth. Tempo inference: reward actual recorded actions rather than opening the page or clicking a decorative node.
- [Finch streaks](https://help.finchcare.com/hc/en-us/articles/37780736136205-Understanding-Streaks): check-in streaks have an explicit rule with pause and repair features. Tempo inference: explain streaks separately from cumulative achievement and keep breaks from erasing earned levels.

Recommended ongoing constraints: one cumulative activity day per local day, no count inflation from repeated same-item checkoffs, no reward claim or purchase loop, no countdown pressure, no punishment for breaks, and clear sample labeling. The reviewed implementation follows these constraints in the observed preview and inspected model.
