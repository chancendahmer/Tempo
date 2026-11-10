# Customer walkthrough from supplied evidence — 2026-10-22

**This is an independent review of root-captured screenshots, not an independently interacted customer test. No functional 8/10 certification or release approval is assigned.**

The parent reviewer requested a fresh novice pass on the new synthetic QA Morgan account at `http://localhost:3103/workspace`, supplied actual IAB browser ID 2/tab 7, and explicitly authorized a screenshot fallback if browser access remained unavailable. I called CUA inventory once. It returned `apps: []` and `browsers: []`. I did not retry, access the account, create records, change settings, submit Ask Tempo, or send messages. Browser ownership is released to the parent reviewer.

Worktree HEAD when inspected: `49c30884bfb4a63416e5bf9e3c245e52d83ca56c`. The source evidence is the root's [fresh browser notes](../fresh-browser/README.md) and screenshots 19–24, opened and visually inspected during this review. The broader [pilot README](../README.md) was read for its evidence boundaries; its historical scores and validation are not adopted as my own. Root's populated QA Riley observations are separate from this new empty-account walkthrough.

The numbers below rate **visible customer clarity only**, using 1–10. They do not rate whether controls work, saved data survives reload, or a real phone receives a message. No overall functional score is supportable from these images.

## Numbered customer walkthrough

1. **Start over with a phone number — visually understandable, clarity 7/10.** The signup image presents a split phone input and a prominent Get started button. The unchecked consent box is visible, and STOP/help/Terms/Privacy language sits alongside it. As a novice, I can see where to begin, though the legal/consent text is markedly smaller than the surrounding marketing. Its readability and touch-target accessibility need a phone and keyboard check. A screenshot with empty inputs cannot prove reset behavior, validation, or whether consent is enforced. [19-signup-number-reset.png](../fresh-browser/19-signup-number-reset.png)

2. **Understand pending setup — visually healthy, clarity 8/10.** “One last step: start the conversation” provides a clear next action, Text START to Tempo, alongside Use a different number and Back to sign in. Finish setup in the navigation also acknowledges unfinished enrollment. The recovery choices are discoverable and do not strand a customer on a generic success page. A one-line explanation of what opens when choosing Text START could reduce uncertainty across desktop and phone. This image does not prove number replacement, deep-link behavior, SMS sending, or activation. [20-replacement-number-pending.png](../fresh-browser/20-replacement-number-pending.png)

3. **Recover an expired sign-in link — visually healthy, clarity 9/10.** The screen plainly says the link expired or was already used and offers Back to sign in. The single next action is easy to understand. It avoids technical error language and gives the user a route forward. Requesting and receiving a replacement link remain untested by me. [21-expired-signin-recovery.png](../fresh-browser/21-expired-signin-recovery.png)

4. **Personalize and confirm time zone — useful but wordy, clarity 7/10.** The dialog says choices are optional, supplies a name field, shows the current UTC setting, and offers Use this device’s zone plus Confirm time zone. Existing reminders keeping their scheduled moment is valuable context. Two adjacent passages repeat that setup does not turn on text check-ins; consolidate them so the time-zone action is easier to scan. A novice may also wonder whether Continue saves the zone or whether Confirm time zone must be clicked first: a visible confirmed state and short instruction would clarify this. The screenshot alone does not establish that ambiguity causes a failed save. Focus, tab order, phone reflow, and time-zone persistence need interaction. [22-new-account-onboarding.png](../fresh-browser/22-new-account-onboarding.png)

5. **Find a first action on an empty Home — visually healthy, clarity 8/10.** The empty banner says “A little room to begin” and offers Add a task. The to-do empty state repeats that a task does not need a time; this lowers the effort of getting started. The calendar honestly asks for a connection instead of inventing events. Home, Spaces, search, Customize home, and Journey are visible. The calendar connection occupies less prominence than the first task, which suits a novice starting without integrations. I have not clicked navigation, added/edited a task, started/paused a timer, reloaded, or used Home preferences on this account. Those requested flows remain unreviewed functionally. [23-new-account-empty-home.png](../fresh-browser/23-new-account-empty-home.png)

6. **Understand a brand-new Journey — attractive, with first-use copy friction, clarity 7/10.** The screenshot shows zero streak, zero wins, zero active days, Level 1, and three days to First light, so no activity is falsely presented as earned. The warm world and “Just the next step” encouragement are welcoming. However, “A fresh start. Your earlier steps still count” presupposes prior activity in a brand-new empty account. Use first-use copy such as “Your first small step can start here,” retaining the earlier-steps reassurance for returning accounts. Celebrate your progress appears faded; its unavailable state would benefit from a nearby explanation if it is disabled until a first completion. Pause animations is visibly available. Its behavior, milestone navigation, reduced motion, and hiding numbers were not tested here. [24-new-account-zero-journey.png](../fresh-browser/24-new-account-zero-journey.png)

## Findings and required follow-through

- **Concrete copy improvements:** remove the duplicate check-in reassurance in onboarding; make zero-history Journey encouragement match a first-time account. Neither is reported as a functional failure.
- **Needs direct verification:** task creation/editing, focus start/pause/reload, navigation/Spaces, Home preference saving, time-zone confirmation, Journey numbers preference, phone layout, keyboard/screen-reader behavior, and validation/error states. Screenshots 19–24 are desktop captures; they do not fulfill the phone pass.
- Root's fresh-browser notes describe wider food, feedback-retry, routine, goal, memory, and Fitness interactions and distinguish those from live-provider evidence. I read those claims but did not independently repeat them or assign new section scores to them.
- No real integrations, paid AI calls, live SMS, provider delivery, production mutation, or personal records were used by this reviewer. No code was changed or committed. No lint/tests/build were run or claimed.

## Supplied screenshots reviewed

![Root capture: phone number signup reset state](../fresh-browser/19-signup-number-reset.png)

![Root capture: pending enrollment with recovery choices](../fresh-browser/20-replacement-number-pending.png)

![Root capture: expired sign-in recovery](../fresh-browser/21-expired-signin-recovery.png)

![Root capture: optional onboarding and time-zone confirmation](../fresh-browser/22-new-account-onboarding.png)

![Root capture: new account empty Home](../fresh-browser/23-new-account-empty-home.png)

![Root capture: new account zero-activity Journey](../fresh-browser/24-new-account-zero-journey.png)

## Revised first-use copy review — 2026-10-23

I opened and visually inspected the three new root-captured screenshots below at original resolution. This follow-up is a **visual copy and readability review only**. I did not use the browser or interact with the controls, and these clarity ratings do not certify functionality, persistence, accessibility compliance, or release readiness. Earlier captures and findings remain historical; the outcomes below supersede their specific copy/readability findings.

7. **First-use Journey wording — fixed visually; clarity 8/10, previously 7/10.** The zero-activity account now says “Your first small step can start here.” That fits the visible zero streak, zero wins, and zero active days and removes the reference to nonexistent earlier steps. The original first-use wording finding is closed. The faded Celebrate your progress action still has no nearby visible explanation in this capture, so that smaller discoverability question remains. No milestone or motion interaction was tested. [26-first-use-journey-revised.png](../fresh-browser/26-first-use-journey-revised.png)

8. **Onboarding reassurance and time-zone confirmation — fixed visually; clarity 8/10, previously 7/10.** The revised dialog includes the check-in assurance once, followed by a shorter shared-account statement. It also visibly shows “Confirmed: New York · Americas” and “Time zone confirmed,” with Continue remaining a distinct next step. This resolves both the duplicated reassurance and the visible ambiguity about whether the zone is confirmed in the captured state. I have not tested changing the zone, saving it, or returning after reload. [29-onboarding-revised-confirmation.png](../fresh-browser/29-onboarding-revised-confirmation.png)

9. **Signup consent readability — improved and finding closed at this desktop size; clarity 8/10, previously 7/10.** The consent text now occupies three readable lines, with Terms and Privacy Policy clearly underlined. It is still subordinate to the signup action, but its meaning is legible in this capture rather than compressed into very small text. Root reports the current DOM uses 14px text with 6px label padding; that measurement is attributed to root, not independently measured here. Checkbox hit area, phone wrapping, zoom, keyboard access, focus treatment, and consent enforcement remain untested. [32-signup-after-runtime-refresh.png](../fresh-browser/32-signup-after-runtime-refresh.png)

All three previously identified visual copy/readability issues are closed on the supplied revised images. **No overall functional score is assigned.** The requested independent browser customer journeys remain outside this screenshot-only evidence.

![Root capture: first-use encouragement matches zero activity](../fresh-browser/26-first-use-journey-revised.png)

![Root capture: concise onboarding and visible time-zone confirmation](../fresh-browser/29-onboarding-revised-confirmation.png)

![Root capture: larger signup consent copy](../fresh-browser/32-signup-after-runtime-refresh.png)
