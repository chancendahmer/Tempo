# Final customer check: Tempo Home and guide

November 11, 2026 · Local fictional workspace preview · 1280 × 720 desktop and 390 × 844 phone viewports

Reviewed code: `b6a394d` (review-only commit `19183d7`). Subsequent independent
audit found a timer-label discrepancy when the preview sample clock differs
from real time. Commit `f1a71d0` keeps saved timer state on the live clock. The
lead independently started a 15-minute timer, switched Home to sample 9:30 PM
while real time was 4:44 PM, and observed “Timer running,” “In progress,” and
14:56 remaining together. Evidence: `private/local-preview-evening-live-timer.png`.
The preview was reset afterward. This supplementary check does not extend the
customer scores below to unreviewed account/provider workflows.

| Area | Rating | What I could do |
| --- | --- | --- |
| Home | 9/10 | Save a task for later today, find it immediately, start and pause its timer, and resume the same session. The state and next action were clear on Home at both sizes. |
| Guide | 9/10 | Complete, replay, go back, and skip the eight-step guide. It points at real controls and gives me something concrete to try. One navigation cue still assumes a desktop header. |

No blocker surfaced in these journeys.

## Home

- On desktop and phone, I used **Add task** to create separate fictional tasks for 7:30 PM and 8:15 PM. The confirmation named the task, disclosed that the preview resets on reload, and offered **View To-do**. The action opened To-do, where I found the new task and started its countdown. [Desktop save](private/local-final-customer-desktop-save.png) · [Phone save](private/local-final-customer-mobile-save.png)
- I paused each timer and selected **Back to my day**. Since I started in To-do, I returned there and used **Tempo home** on desktop or **Open navigation → Today** on the phone to reach Home. Home moved the focus owner to the top, labeled its row **Paused**, and offered **Continue** on that row only. Other visible task timers were disabled, and the list explained **One focus session at a time** and offered to reopen the active timer. [Desktop paused](private/local-final-customer-desktop-paused-home.png) · [Phone paused](private/local-final-customer-mobile-paused-home.png)
- **Continue focus → Resume → Back to my day** from Home returned to the same session. The banner read **Timer running. One step at a time.** and the row read **In progress**. The preview update toast and floating timer did not cover each other at either size. On the phone I measured a 32.4 CSS pixel vertical gap between them while both were visible. [Desktop running](private/local-final-customer-desktop-running-home.png) · [Phone running](private/local-final-customer-mobile-running-home.png)
- I let a separate one-minute timer run down naturally on the phone. At **0:00** the Home banner said **Your timer is finished. Choose what comes next.**, and the owner row read **Timer finished**. [Phone at expiry](private/local-final-customer-mobile-finished-home.png)

## Guide

- I opened **Take the tour** and followed all eight steps to **Done** at both sizes. Step 1 pointed to **Spaces**; step 2 suggested trying the Home banner button or choosing a different task from **Your to-do**. Step 5 used the same name, **navigation button**, for the way to open Ask Tempo. Step 8 explained the private pilot and offered **Continue with phone**. I left that account action untouched. [Desktop first step](private/local-final-customer-desktop-tour-1.png) · [Phone first step](private/local-final-customer-mobile-tour-1.png) · [Phone last step](private/local-final-customer-mobile-tour-8.png)
- **Back** returned to the preceding step, reopening the tour started at step 1, and **Skip tour** dismissed it. On the phone, focus returned to **Take the tour** after skipping.

## Small remaining friction

- Step 1 tells me to find the navigation button “beside Tempo” on other pages. The 390 px To-do header has the three-line button at the left but no Tempo wordmark. “The three-line navigation button at the top left” would work in both layouts. [Phone To-do header](private/local-final-customer-mobile-todo-header.png)
- The 390 px save toast wraps **View To-do** onto three lines. It is readable and the action works, but giving that action more width or placing it on its own line would make it easier to scan. [Phone save](private/local-final-customer-mobile-save.png)

This was a review of the local preview with fictional data. It did not establish account persistence, hosted behavior, live model behavior, or SMS delivery. I restored the 1280 × 720 default viewport and reloaded; the fixture tasks and timer were gone and Home showed the original sample list. Screenshot files are local and Git-ignored.
