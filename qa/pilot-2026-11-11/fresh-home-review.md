# Fresh customer review of Tempo Home and the guide

November 11, 2026 · Local workspace preview · 1280 × 720 and 390 × 844

| Area | Rating | Customer experience |
| --- | --- | --- |
| Home | 8/10 | I could save a task, find it immediately, and pick up the paused timer from Home. The running timer's banner copy made me wonder whether the countdown was still going. |
| Guide | 9/10 | The guide pointed at the actual Spaces and Start controls and told me what to try next. I completed all eight steps at both sizes and could skip or restart the tour. |

## Home walkthrough

1. Home opened with three task rows and **Show 4 more**. I added the fictional task **QA fixture: Catalog imaginary moon rocks**, set its estimate to 25 minutes, and scheduled it for 6:50 PM local time. It fell outside the three collapsed rows. The confirmation named the task, stated the preview reset behavior, and offered **View To-do**. The button took me to To-do, where the task appeared fourth under **Today**, with the time and estimate I entered. [Home before adding](private/local-fresh-review-home.png) · [Save confirmation](private/local-fresh-review-task-saved.png)
2. In To-do, I opened the task's **Focus on** control, saw the 25-minute countdown start, and paused at 24:55. I returned through **Back to my day** and **Tempo home**. Home brought the task to the top of the list and labeled the row **Paused** with a **Continue** action. Other visible Start buttons were disabled. The explanation above the list said **One focus session at a time** and offered **Open your timer**. That opened the same task at 24:55, and **Resume** restarted its countdown. [Paused Home](private/local-fresh-review-paused-home.png)
3. At 390 × 844, the Home content fit the viewport without horizontal overflow. The main Start action and **Add task** were visible in the initial view. [Phone Home](private/local-fresh-review-mobile-home.png)

## Guide walkthrough

1. I opened **Take the tour**, advanced through steps 1–8, and selected **Done**. Step 1 highlighted **Spaces** and identified the three-line navigation button for other pages. Step 2 highlighted the Home banner action and suggested trying it or choosing another task from **Your to-do**. [Desktop step 1](private/local-fresh-review-guide-navigation.png) · [Phone step 1](private/local-fresh-review-mobile-guide-navigation.png) · [Phone step 2](private/local-fresh-review-mobile-guide-next-action.png)
2. **Skip tour** closed the guide and returned focus to **Take the tour**. Reopening started at step 1 and focused its heading. On the phone viewport, **Back** returned from step 2 to step 1. I then replayed and completed all eight steps at that size.

## Remaining friction

- After resuming and returning to Home, the countdown kept advancing and the row read **In progress**. The banner still said **Your saved timer is ready to continue**, and the explanation above the list offered to resume it. State-specific wording would make it clear that opening the timer is optional while it runs. [Running Home](private/local-fresh-review-running-home.png)
- At the desktop size, the floating countdown covered part of the generic preview update message after I returned from the timer. The saved-task confirmation earlier in the flow was readable and actionable. [Overlapping message](private/local-fresh-review-running-home.png)
- Step 5 refers to **Menu**, while step 1 describes the three-line navigation button. A consistent name would help someone find the icon from Home.

## Scope

The review used the local fictional preview. Account persistence, calendar linking, live model calls, and SMS were outside the review. Reload returned Home to its initial three rows and **Show 4 more** with the fictional task cleared. I restored the default viewport. Screenshot files are local and Git-ignored.
