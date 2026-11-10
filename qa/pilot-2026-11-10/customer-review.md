# Independent customer evidence review

November 10, 2026. The review uses the signed-in local candidate and run-owned synthetic accounts. I inspected the current screenshots and ran separate read-only PostgreSQL checks on the browser fixture. The lead operated the browser. The independent review surface exposed no dedicated in-app or Chrome browser session, so I did not drive the lead's shared browser.

## Thought to task and focus

1. The lead signed in to the empty Rowan account, saved **Open studio questions** in Thoughts, and ran the captured SMS fixture. The same browser session subsequently showed **Call the pottery studio** on Home without a manual reload. The lead first saw the old **Add to To-do** action in Thoughts after waiting. No same-view update latency was measured and that first refresh result remains open.
2. I opened the current screenshot. The new task has a prominent **Start 6 min** action in the Home hero and a smaller, repeated action in Your to-do. The latter makes the task easy to find after the hero changes, although repeating its exact title and action could look like duplication to a first-time customer. Calendar clearly shows that a connection is required. Home screenshot clarity is **8/10**. [Current Home screenshot](browser/01-home-sms-task.png)
3. The lead observed the timer paused at 3:36, reloaded, saw the same paused time, resumed, and completed the task. I independently confirmed one original note, one exact same-owner task link with status completed and estimate six minutes, and zero remaining focus rows. Cedar had zero tasks and its one private note.
4. I opened the completion screenshot. The original title and full short body remain visible, and **Completed: Call the pottery studio** sits directly underneath. **Open task** is a distinct next action. The lead followed it to a completed To-do editor with a Reopen task action. The note edit and remove affordances are small glyphs on this desktop capture and need phone-width and keyboard checks. Thoughts completion clarity is **8.5/10**. [Completed thought screenshot](browser/02-linked-thought-completed.png)

The Home score describes one visible state. A full thought-to-focus customer score requires confirmed same-view synchronization, contextual retrieval in the browser, account-switch behavior, and phone-width and keyboard interaction. The separate HTTP run confirms persisted lifecycle and replay. It cannot establish those UI stages. [Authenticated HTTP results](http-results.json)

## Coverage by journey

| Journey | Authenticated HTTP and PostgreSQL | Current independent visual evidence |
| --- | --- | --- |
| Thought to task and focus | Passed | Home and completed Thoughts screenshots reviewed. Browser timer and Open task interaction attributed to lead, with independent record corroboration. |
| Task and reminder | Passed | First move needed reload in the observed interval. The second move appeared in the same open view by about two minutes without reload or navigation. |
| Meal, groceries, pantry and consumption | Passed | Lead exercised the signed-in journey. Independent screenshot and SQL review corroborate the final shopping, pantry, and nutrition states. |
| Routine reorder and completion | Passed | Captured SMS reorder updated the same open view. Browser time and duration repair survived reload. Read-only SQL confirmed unchanged step IDs and checkoff. |
| Fitness plan and actual log | Passed | Lead exercised the plan, captured SMS scheduling, shorter logged session, date repair and reload. Independent screenshots and SQL corroborate separate records. |
| Removal, stale owner and return | Passed | The stale browser editor cleared after sign-in switched to Cedar. Independent SQL confirmed exactly the expected notes and replies in each account. |

## Reminder refresh follow-up

The lead kept Reminders open after a captured assistant move from 2 PM to 1 PM. The browser still displayed 2 PM more than 30 seconds after the bridge completed, with the document visible. I opened the screenshot and verified that it shows the old time, even though the filename describes the action. Reload then showed the saved 1 PM time according to the lead. [Pre-reload stale reminder screenshot](browser/03-sms-reminder-moved.png)

The second move changed the same reminder from 1 PM to 12:30 PM. The lead kept the same Reminders view open with no reload, navigation, or explicit focus action. I opened the later screenshot and verified 12:30 PM. The lead's approximate timestamps bound the second update to about two minutes. They do not verify the expected poll interval or explain the first stale observation. The scheduled state and reminder subject are clear. The time sits in smaller secondary text beside cadence and the timezone identifier, so that group merits a phone-width read. Reminders screenshot clarity is **8/10**. [Same-view automatic update screenshot](browser/04-reminder-refresh-observation.png)

The lead also observed repeated React duplicate-key warnings after Ask Tempo displayed a reminder read-back. The reply placed a two-item numbered list immediately before a paragraph. A component regression reproduced the exact sibling keys `2` and `2`. The formatter now keys each list from its first line, preserving the visible content. The regression passed after the repair, along with all four formatter tests, lint, and typecheck. A fresh browser-console replay is still needed to close the rendered observation.

## Meals, shopping, and nutrition

1. The lead saved a two-serving recipe, planned four portions, and saw 400 g rice to buy. Recording 100 g of actual pantry stock reduced shopping to 300 g. The captured SMS fixture changed the same meal to two portions, reducing the shopping need to 100 g. I opened the final Groceries screenshot and independently checked the same account's SQL records. The two-portion meal retains its ingredients and original serving basis. Shopping retains one source-linked 100 g rice row, one source-linked lemon, and unchecked manual Peppermint tea. Pantry separately contains 100 g rice. Cedar has no food or shopping records. [Shopping and pantry after the serving change](browser/05-meal-servings-shopping.png)
2. The lead observed an empty Nutrition diary after planning the meal, then entered and favorited a separate manual lunch. The screenshot shows 180 kcal logged and 9 g protein, with no numeric carbs, fat, or fiber. Read-only SQL confirmed exactly one manual food record, November 10 Lunch, with those values and the three null nutrients. The meal and grocery actions did not appear as consumed food. [Known and unknown nutrition amounts](browser/06-nutrition-known-and-unknown.png)

| Bounded customer journey before the follow-up fixes | Correct state /3 | Persistence and replay /2 | Isolation /2 | Findability and recovery /2 | Phone and keyboard /1 | Evidence score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Meal portions and shopping | 3 | 1.5 | 2 | 1.5 | 0 | **8/10** |
| Manual nutrition entry | 3 | 1.5 | 2 | 1 | 0 | **7.5/10** |

Persistence credit comes from the signed-in interactions, independent durable reads and separate fresh authenticated HTTP journey. A complete same-browser reload/replay and phone-width/keyboard pass are still needed. Zero in the phone/keyboard column means unverified.

- **Shopping.** The two equal 100 g amounts look identical at a glance. Keep the existing source link, label the shopping amount as quantity to buy, and state near the list that matching pantry stock is already deducted. Show the source date in the same customer-facing format as the rest of Planner.
- **Nutrition.** A card with every amount missing currently says “partial total,” implying some known quantity was added. Show **Unknown** when entries exist but none provide a value. Reserve **Partial total** for a real numeric subtotal with missing entries, and keep a known zero distinct. Use explicit unknown labels in the diary and meal summaries as well. Verify the revised labels with one all-unknown day and one mixed-coverage day.

### Follow-up after the label changes

The revised shopping view distinguishes **To buy** from **In stock**, shows **100 g rice covered by pantry stock**, and displays a human-readable meal source date. I opened the phone-width capture and verified all three. The deduction is the difference between the saved source quantities and net shopping need. It is omitted when a source has an unknown quantity. The phone screenshot adds responsive evidence, while full keyboard and same-browser reload evidence for shopping remain separate. [Updated phone shopping view](browser/10-shopping-phone.png)

The lead logged a second food using a typed barcode and reloaded the phone-width Nutrition diary. I opened the resulting screenshots. They show 287.8 kcal, 10.3 g protein, explicit unknown carbs and fat on the manual entry, and numeric partial totals once the catalog entry contributes known amounts. Known zero fiber remains distinct from the other entry's unknown fiber. This observed lookup used a typed barcode; it does not establish camera use. [Typed-barcode result](browser/07-barcode-food-logged.png) · [Phone diary after reload](browser/08-nutrition-phone-reload.png)

A keyboard copy exposed a separate write defect. The lead picked a later date, changed the multiplier, and observed the native date revert to the original day. I confirmed the resulting half portion was stored on November 10 alongside the original. The repair reads the native form fields at submit for both Copy and manual food dates. On the lead's next browser attempt, November 12 stayed selected after editing the multiplier to 0.25, and the confirmation named November 12 and offered **View that day**. I independently verified exactly one November 12 Lunch copy with 45 kcal, 2.25 g protein, three unknown nutrients and favorite cleared. November 10 still held the original 180 kcal and the preserved pre-fix 90 kcal test record. Cedar still had no food. [Wrong-day write before repair](browser/09-copy-date-investigation.png)

The lead then selected the copied day and reloaded. I opened the resulting screenshot and verified November 12 with one 45 kcal Lunch entry, protein displayed as 2.3 g from the stored 2.25 g, unknown carbs and fat, and an unselected favorite. The earlier wrong-date entry was not deleted or reinterpreted as a successful target-day copy. [Corrected copy after target-day reload](browser/11-nutrition-copy-date-reload.png)

The selected-day display suppresses exact remaining calories and target progress when the backend reports incomplete diary coverage. Progress labels identify numeric partial totals where nutrient values are missing. The lead confirmed that Escape from Copy returned focus to its copy button and Escape from Daily targets returned focus to Daily targets. The manual editor also rejects a close from an older save if the customer has opened a replacement editor.

| Bounded customer journey after the follow-up fixes | Correct state /3 | Persistence and replay /2 | Isolation /2 | Findability and recovery /2 | Phone and keyboard /1 | Evidence score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Meal portions and shopping | 3 | 1.5 | 2 | 1.5 | 0.5 | **8.5/10** |
| Nutrition entry and corrected date copy | 3 | 2 | 2 | 1 | 1 | **9/10** |

The shopping score still lacks a full same-browser reload/replay and keyboard pass. The nutrition score covers the entry and date-copy journey. It credits the target confirmation, reload, keyboard focus check, and owner-scoped durable records. The phone-width navigation clips neighboring tabs and the saved status uses both a generic toast and a destination notice. The score does not extend to full Nutrition Tracker accessibility, camera scanning, live assistant correction of Rowan's entries, or historical correction of the preserved pre-fix record.

The lead also reproduced the same native date reset in Fitness before submission, then cancelled that form. Completed movement now reads its date from the native form on submit. A regression verifies the earlier date and existing plan association. The Fitness summary also marks selected-day minutes as loaded entries and reports how many of the saved sessions are shown when that date is truncated.

## Fitness plan and dated logs

After the date repair, the lead chose November 9, entered 12 minutes, and saved the generic QA riverside walk. The separate November 10 log records the saved plan's second session, **River strength**, at 12 actual minutes. The assistant-scheduled task remains open for November 12 at 5 PM New York time with its original 18-minute estimate. Read-only SQL verified both log dates, the exact owned plan/session association, and no workout or routine records in Cedar. I opened the reloaded Fitness screenshot and verified the two distinct history rows. The header still reports 12 minutes for the selected November 10 day while All history shows both rows, as its smaller label indicates. [Fitness logs after reload](browser/12-fitness-dated-logs-reload.png)

The first scripted read-back tried to select one workout across all history and failed once there were two correct records. Its fallback reply is preserved as a fixture failure. The corrected read-back queried the current account diary day and selected the exact saved plan and session. The lead submitted it through Rowan's browser. I independently verified the saved reply says 18 minutes planned and 12 logged, without counting the November 9 walk as today's planned-session log. The separate HTTP run also includes a prior-day workout.

The bounded Fitness workflow is **8.5/10** on current evidence (3 correct state, 2 durable follow-through, 2 isolation, 1.5 findability, 0 phone and keyboard). Schedule and Log completed are distinct controls. Giving the selected date more weight beside the top minutes would reduce the chance of reading the selected-day total as an all-history total. The available capture does not cover phone layout or keyboard focus for Fitness.

## Routine reorder, start time, and checkoff

The lead checked off **Hang up keys** before a captured SMS reorder. The open browser updated to show **Put shoes away** first at three minutes, with the prior checkoff still on Hang up keys. The lead then reproduced a separate edit defect before saving. Entering a new native start time and changing the step duration reverted the visible time to 08:00. The editor now submits the visible native time with the controlled step draft. The lead retried, saved 09:15 and four minutes for Put shoes away, and reloaded. [Routine after reorder and time repair](browser/13-routine-reordered-time-reload.png)

Before the time edit, the lead submitted a same-account Ask Tempo question. The saved reply correctly described the post-reorder state at that point: Put shoes away first, three minutes and open, then Hang up keys checked off at one minute. I verified the reply in read-only PostgreSQL.

I verified the final screenshot and compared exact step IDs before and after the time edit. Both IDs remained unchanged. Put shoes away was first, four minutes, and open. Hang up keys remained second, one minute, and checked on November 10. The Routine card showed one of two steps complete and the correct next step. Cedar still had no routine. The lead confirmed Escape returned focus to the exact Edit button, where the screenshot shows the visible focus ring.

The bounded Routine workflow is **9/10** (3 correct state, 2 durable follow-through, 2 isolation, 1.5 findability, 0.5 phone and keyboard). The score covers the same-view update, date-local checkoff identity, edit and reload, scoped read-back, and Escape focus. It does not establish phone-width interactions or the next-day reset in an actual browser.

## Account switch with a stale editor

The lead opened Rowan's **Old paint swatch** in a second browser tab, removed the saved note through the captured SMS path, and signed into Cedar through a fresh normal action link in the first tab. The stale editor closed before the lead could fill or save it. I opened the resulting screenshot and verified only Cedar's single synthetic note was visible. The browser action was prevented before it became a stale POST. The separate authenticated HTTP run sent the stale Rowan owner proof with a Cedar cookie and observed 409. [Stale tab after the account switch](browser/14-stale-tab-account-switch.png) · [Authenticated HTTP results](http-results.json)

Read-only SQL confirmed the removed note was absent. Rowan's original studio note retained its exact body and completed same-owner task link. Cedar's one note retained its exact original title, body, and version, with no other items or tasks. Each account had exactly one own-account contextual reply, and the Cedar replay created no additional reply. This confirms isolation for the tested synthetic pair without exposing raw account or session identifiers.

## Carrier smoke and remaining customer gates

The lead sent HELP from the dedicated demo number to the existing production Tempo line at approximately 2:34 PM New York time and observed the actual reply in TextFree by approximately 2:36 PM. The screenshot remains in the ignored private directory. This establishes one carrier round trip through the existing production build `86ae010`. The deterministic HELP path did not use the paid model. The separate historical investigation used six read-only provider history GETs and did not resolve the historical uncertain submissions. [Historical outbound evidence](outbound-history-review.md)

1. **Rendered account return.** The tested browser switch cleared the stale Rowan editor and the HTTP suite rejects stale Rowan ownership with a Cedar cookie. Complete the return through a fresh Rowan link and verify its valid changes after reload. Browser stale logout and carrier-origin signup remain separate from this stale-editor check.
2. **Candidate delivery and Calendar confirmation.** HELP validates the currently deployed carrier path. The candidate still needs a dedicated real scheduled reminder with observed delivery and matching dashboard record, plus a confirmed Calendar edit on an authorized synthetic account. Keep candidate worker and deployment readiness, carrier consent, and Google ownership checks separate from the synthetic browser and live-model runs. [Private beta release gates](../../docs/PRIVATE_BETA_PILOT.md)
3. **Current workflow breadth.** After routine identity through reorder and refresh, a goal-linked task completion with Journey earning only the expected activity and current Settings account recovery are the most useful remaining rendered checks. The prior pilot documented separate historical browser coverage for goals, setup, account recovery, and preferences. Camera scanning, physical phone and assistive-technology verification remain separate. [Prior pilot coverage](../../docs/PILOT_HANDOFF.md)

No whole-product rating is supported by the reviewed evidence. Paid model interpretation, carrier delivery, hosted execution, connected integrations and physical-device accessibility are separate from these scores.
