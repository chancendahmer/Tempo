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

Captured SMS uses the real Sendblue payload parser, real ingress repository, durable inbound job, real orchestrator, product repositories and production outbound safeguards. An explicit fixture parser and independent fixture write grant replace the paid model. The CLI claims and finishes one exact scheduled action. It leaves the worker stopped. Contextual sentences derive from current tool output. A database snapshot checks that the other account's items, tasks, goals, reminders, memories, settings and messages stayed unchanged during the turn. The normal signed-in web request handles chat writes independently of the bridge. The fixed provider event ID allows a duplicate input to be verified without another job or reply.

## HTTP and PostgreSQL complement

```powershell
node --import tsx qa/pilot-2026-11-10/http-journeys.ts
```

Each invocation uses new Ash and Birch fixture accounts and the actual local sign-in, workspace, logout and chat routes. It processes six scenario groups, reports sanitized outcomes in `http-results.json`, and removes its two run-owned accounts on a successful run. Failed synthetic runs retain their isolated rows for diagnostics. Browser fixture accounts remain available for the separate review.

## Scoring and limits

Score each observed browser journey independently. Award up to three points for exact and correct results, two for persistence and replay, two for account isolation and authorization, two for findability and recovery, and one for keyboard and phone-width operation. An unobserved critical stage leaves the journey unverified. A persistence or isolation failure blocks a 9/10 score regardless of the other scores. Record the initiating account, expected outcome, observed pre/post-reload state, contextual lookup, other-account assertion and device evidence per journey.

Authenticated HTTP checks establish application and PostgreSQL behavior through the normal routes. Rendered usability and automatic refresh require separate browser evidence. The scripted parser cannot evaluate natural-language interpretation or semantic authorization. Carrier receipt, paid model quality, hosted worker behavior, connected Calendar, physical device use and assistive technology remain separate checks.
