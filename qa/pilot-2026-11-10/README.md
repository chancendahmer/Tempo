# Shared account customer QA

Run these checks from the adaptive Home worktree. The fixture requires the known isolated PostgreSQL cluster on `127.0.0.1:55437/tempo_ui_release` and the local candidate on `http://localhost:3103` started with `node qa/adaptive-home/start.cjs`. Keep the normal worker and provider credentials absent. The bridge accepts no endpoint or database override and never reads an environment file. It rejects HTTP calls in its process and the only SMS sender captures replies in memory. All fixture accounts use reserved fictional numbers.

## Browser account setup

```powershell
node --import tsx qa/pilot-2026-11-10/account-bridge.ts init
```

Run `init` once. A is QA Rowan and begins empty. B is QA Cedar and holds one distinct synthetic note. They sign in through the actual action-link preview and **Open my dashboard** confirmation. The single-use URLs are in `private/local-access.json`, under keys `a` and `b`. Keep the file private and exclude sign-in URLs and the browser address bar from evidence. Use `links` in place of `init` to renew expired or redeemed links. After activation, use `/workspace` and do not use `/workspace/preview`.

## Browser steps

Use the date printed by `init` for future scheduling. For the SMS action, leave the relevant browser section open and run the corresponding `turn` command below. Observe the automatic update first, then separately reload and check it again. The local UI normally polls at intervals of about 15–16 seconds when no pending message is visible. For contextual retrieval, run `prompt <read-step>`, submit the resulting exact sentence once through **Ask Tempo**, then run `turn <read-step> web a`. The bridge processes only that account's exact matching pending message.

| Journey | Enter in the authenticated UI | SMS bridge steps | Postconditions and contextual read |
| --- | --- | --- | --- |
| Thoughts and focus | Save a thought called **Open studio questions** with any synthetic body. | `turn thought`, then repeat it once. | Original note stays with the one linked **Call the pottery studio** task. Start the six-minute timer, pause, reload, and complete it. `thought-read` reports the surviving note and completed task. |
| Tasks and reminders | Schedule **Outline the neighborhood poster** for 3 PM New York on the fixture date. | `turn reminder`, then `turn reminder-move`. | Reminder moves from 2 PM to 1 PM with its identity and one pending occurrence. Task stays at 3 PM. Complete the task, then use `reminder-read`. Cancel the reminder separately when done. |
| Meals and shopping | Save a two-serving recipe **Citrus rice dinner** with ingredient lines `200 g rice` and `1 lemon`. Plan four dinner portions from that recipe, add manual **Peppermint tea**, and save 100 g of **Rice** in Pantry. | `turn meal`. | Meal moves to two portions and needs 100 g of rice. Manual tea and actual pantry stock stay. Use `meal-read` to distinguish the plan from saved food logs. |
| Routines | Save a two-step **Quick hallway reset** and check off the first step today. | `turn routine`. | Step two moves first and becomes three minutes. Earlier check-off persists by step ID. `routine-read` reads current order and completion. |
| Fitness | Save **Riverside sessions** with at least two sessions, with distinguishable names and durations. | `turn workout`. | To-do gains one future task for the second session. Use Fitness to log that session for fewer minutes today. `workout-read` reports planned and actual duration separately. |
| Account switch | In A, save **Old paint swatch**, then leave an edit form open in a second tab while A is signed in. | `turn remove-note`. | Sign in as B normally, try the stale A form, and look for account-change recovery and no A content. Use `turn isolation-read sms b` and `turn isolation-read sms a` to check the distinct account lookups. Return to A through a fresh normal link and confirm the note stays removed while unrelated work remains. |

For the November 12 browser fixture, move the poster reminder from 1 PM to 12:30 PM with `turn reminder-move-fresh`. Reopen the poster task and save it for November 13 at 4:15 PM New York time with a 25-minute estimate. With Reminders open, run `turn reminder-cancel-fresh` and repeat it once to check replay. The bridge verifies the same reminder and delivery occurrence were cancelled, with the task unchanged and one reply. Use `reminder-cancel-read` through Ask Tempo to retrieve both saved states and `task-current-read` for the task alone.

Example commands:

```powershell
node --import tsx qa/pilot-2026-11-10/account-bridge.ts turn thought
node --import tsx qa/pilot-2026-11-10/account-bridge.ts prompt thought-read
node --import tsx qa/pilot-2026-11-10/account-bridge.ts turn thought-read web a
```

### Fresh thought and shopping updates

Use the existing Rowan browser account. Save one new Thought titled **Museum workshop questions** with the exact body `Ask about clay tools and Saturday places.` Keep Thoughts open while running the first command. Wait for the existing row to gain **Open task** without navigating or reloading. Open the task and verify the title **Ask the museum about clay tools** and seven-minute estimate. Repeat the exact command to verify one inbound message, job, task and reply, with the original note and task link unchanged. Submit the printed read prompt once in Ask Tempo before running its web turn. Confirm the reply shows the original note body and current linked task.

```powershell
node --import tsx qa/pilot-2026-11-10/account-bridge.ts turn museum-thought-fresh
node --import tsx qa/pilot-2026-11-10/account-bridge.ts turn museum-thought-fresh
node --import tsx qa/pilot-2026-11-10/account-bridge.ts prompt museum-thought-read
node --import tsx qa/pilot-2026-11-10/account-bridge.ts turn museum-thought-read web a
```

With Rowan’s existing **Citrus rice dinner** at four portions, leave Groceries open. The starting list has 300 g of generated rice to buy, two lemons and manual **Peppermint tea**, with 100 g of rice in Pantry. Run the fresh SMS turn and wait for 100 g of generated rice and one lemon to appear without a reload. Reload separately and verify that the plan now has two portions and the manual tea and pantry stock are unchanged. Submit the printed read prompt once in Ask Tempo before running its web turn. Confirm the reply distinguishes the meal plan, shopping quantities and pantry stock.

```powershell
node --import tsx qa/pilot-2026-11-10/account-bridge.ts turn citrus-shopping-fresh
node --import tsx qa/pilot-2026-11-10/account-bridge.ts prompt citrus-shopping-read
node --import tsx qa/pilot-2026-11-10/account-bridge.ts turn citrus-shopping-read web a
```

For a fresh automatic-update observation from two portions, keep Groceries open at 100 g rice and one lemon. Note the time, run the three-portion SMS turn, and observe the same open page for up to 35 seconds without navigating or reloading. Record when it shows 200 g rice and 1½ lemon, or record that it stayed stale. Reload separately, repeat the SMS turn to verify exact replay, then submit the distinct three-portion prompt once through Ask Tempo and process that web turn. The bridge checks that the existing plan and generated rows keep their IDs, both shopping amounts change, and manual tea and 100 g pantry rice stay intact.

```powershell
node --import tsx qa/pilot-2026-11-10/account-bridge.ts turn citrus-shopping-three
node --import tsx qa/pilot-2026-11-10/account-bridge.ts turn citrus-shopping-three
node --import tsx qa/pilot-2026-11-10/account-bridge.ts prompt citrus-shopping-three-read
node --import tsx qa/pilot-2026-11-10/account-bridge.ts turn citrus-shopping-three-read web a
```

### Live-model nutrition on the browser account

Leave Rowan’s Nutrition Tracker open on the current New York day. The preflight verifies the browser fixture and does not load model credentials or run a turn. Each `run` uses the shared live QA budget journal and captures SMS locally. Run one phase at a time so you can observe and reload the browser between phases.

```powershell
node --import tsx qa/pilot-2026-11-10/live-browser-journey.ts preflight log
node --import tsx qa/pilot-2026-11-10/live-browser-journey.ts run '<configured runtime directory>' log
node --import tsx qa/pilot-2026-11-10/live-browser-journey.ts run '<configured runtime directory>' correct
node --import tsx qa/pilot-2026-11-10/live-browser-journey.ts prompt advice
# Submit the exact printed advice prompt once in Rowan's Ask Tempo.
node --import tsx qa/pilot-2026-11-10/live-browser-journey.ts run '<configured runtime directory>' advice web
```

The entry should go from 320 calories and 14 g protein to 480 calories and 21 g protein in place. Carbs, fat, and fiber remain unknown. The advice turn must read that current entry and preserve both accounts. Each phase checks replay inside the same budget lock. Replies and tool evidence are saved under the ignored private transcript directory.

### Live-model save and recall after removing a memory

From Rowan’s Memories, choose **Add a memory** to open Ask Tempo. Replace the draft with the exact sentence printed by `prompt memory-save`, submit once, and run the web phase. Verify the preference in Memories and after reload. Remove that preference in Memories, then submit the exact `prompt memory-recall` sentence in Ask Tempo once and run the recall phase.

```powershell
node --import tsx qa/pilot-2026-11-10/live-browser-journey.ts preflight memory-save
node --import tsx qa/pilot-2026-11-10/live-browser-journey.ts prompt memory-save
node --import tsx qa/pilot-2026-11-10/live-browser-journey.ts run '<configured runtime directory>' memory-save web
node --import tsx qa/pilot-2026-11-10/live-browser-journey.ts preflight memory-recall
node --import tsx qa/pilot-2026-11-10/live-browser-journey.ts prompt memory-recall
node --import tsx qa/pilot-2026-11-10/live-browser-journey.ts run '<configured runtime directory>' memory-recall web
```

The recall phase requires the deleted record and original request to remain in PostgreSQL, with the preference absent from current saved-memory context and the scoped recall tool result. The reply must report that it is absent. Replay rechecks the completed web job.

Captured SMS uses the real Sendblue payload parser, real ingress repository, durable inbound job, real orchestrator, product repositories and production outbound safeguards. An explicit fixture parser and independent fixture write grant replace the paid model. The CLI claims and finishes one exact scheduled action. It leaves the worker stopped. Contextual sentences derive from current tool output. A database snapshot checks that the other account's items, tasks, goals, reminders, memories, settings and messages stayed unchanged during the turn. The normal signed-in web request handles chat writes independently of the bridge. The fixed provider event ID allows a duplicate input to be verified without another job or reply.

## HTTP and PostgreSQL complement

```powershell
node --import tsx qa/pilot-2026-11-10/http-journeys.ts
```

Each invocation uses new Ash and Birch fixture accounts and the actual local sign-in, workspace, logout and chat routes. The retained run passed nine scenario groups, including exact retries of task completion, goal achievement, setup and profile changes. The report records cleanup as a separate tenth outcome. The harness removes its two run-owned accounts after a successful run. Failed synthetic runs retain their isolated rows for diagnostics. Browser fixture accounts remain available for the separate review. [HTTP results](http-results.json)

## Latest browser evidence

At phone width, the lead verified that the privacy cover masks account identity in the navigation drawer and account menu, disables Capture and Home search, keeps logout available, and restores the Home search draft on reveal. The lead also verified Escape focus recovery from the drawer. Speech cancellation is covered by source inspection. [Hidden navigation](browser/49-hidden-navigation-phone.png) · [Hidden account menu](browser/50-hidden-account-menu-phone.png)

The lead observed a fresh Sonnet 4.6 combined rundown through normal authenticated Ask Tempo on the isolated PostgreSQL fixture. The independent reliability review compared the stored reply with four current-record reads and scored this specific request **9/10**. It verified the corrected goal and reminder statuses, unchanged account records and exact replay without extra model calls. A repeated history limitation cost the presentation point. The earlier failures remain in the evidence. [Passing browser reply](browser/51-live-rundown-current-status-pass.png) · [Independent semantic review](live-semantic-review.md) · [Customer review and remaining gates](fresh-customer-review.md)

The separate `rundown-release` phase checks the ordinary Sonnet path after the search adapter change. Run its `preflight` and `prompt` before submitting the exact new prompt once in Ask Tempo. The lead owns the paid run with the existing QA journal. This phase enables the custom search tool and checks that every model request offers it as a client tool. It rejects hosted search or another model before forwarding and retains the same four required reads, no-write, isolation, and replay checks. One optional Calendar read inside the New York fixture day returns a synthetic unverified status. The fixture records that response separately from the four actual reads.

The first `rundown-release` trace shows six settled Sonnet requests offering the client search tool, zero child-model attempts, all four required reads, and a persisted reply. The fixture rejected the optional fifth Calendar read and stopped before its state comparison and exact replay assertions. That run supplies request and reply evidence. Its fixture result remains partial. A future paid check would need a fresh phase and request identity.

## Scoring and limits

Score each observed browser journey independently. Award up to three points for exact and correct results, two for persistence and replay, two for account isolation and authorization, two for findability and recovery, and one for keyboard and phone-width operation. An unobserved critical stage leaves the journey unverified. A persistence or isolation failure blocks a 9/10 score regardless of the other scores. Record the initiating account, expected outcome, observed pre/post-reload state, contextual lookup, other-account assertion and device evidence per journey.

Authenticated HTTP checks establish application and PostgreSQL behavior through the normal routes. Rendered usability and automatic refresh require separate browser evidence. The scripted parser cannot evaluate natural-language interpretation or semantic authorization. Carrier receipt, paid model quality, hosted worker behavior, connected Calendar, physical device use and assistive technology remain separate checks.
