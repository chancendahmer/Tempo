# Novice walkthrough of Home prioritization and the guided tour

| Area | Initial preview score | Rationale |
| --- | --- | --- |
| Home prioritization | 7/10 | Today’s task stayed above the old deadline and the timer made the chosen task easy to resume. The new task was hard to find after saving, and the paused state differed across Home. |
| Guided tour | 8/10 | The guide pointed to real controls, showed progress, and let me go back, skip, finish, and replay. The Home step could better explain why a task appears first and give me a small action to try. |

## Scope

One reviewer walked through the local fictional Alex preview on November 11, 2026, using the in-app browser at desktop size. The authenticated local QA Rowan tab was unavailable to this browser session, so the review used `/workspace/preview`. The preview announces that sample changes reset on reload. Account persistence, first sign-in behavior, phone verification, integrations, and narrow-screen behavior remain unverified. The scores reflect this walkthrough of fictional data and provide no measure of customer adoption or market readiness.

## Home prioritization

1. At about 4:23 PM Eastern, I used **Add task** on Home to save `Priority QA old deadline` for November 4 at 5:00 PM and then `Priority QA due today` for November 11 at 5:15 PM. The form distinguished a task time from a text reminder. The collapsed list kept the same three tasks after both saves and showed **Show 6 more**. Expanding showed four November 11 tasks in time order, then the November 4 task marked **Overdue**, then an **Anytime** task and later dates. The banner stayed on the first of today’s tasks. [Expanded Home order](private/local-priority-expanded-order.png)
2. I started a 10-minute timer for `Priority QA due today`. It opened the focus view and moved that task to the top of Home. I paused the timer and used **Back to my day**. The banner said **Paused. Continue when you’re ready.** The task stayed first with **Continue**, the floating timer displayed the remaining time, and the other task timers were disabled. [Running timer](private/local-priority-timer-running.png), [Paused timer on Home](private/local-priority-timer-paused-home.png)
3. Reload returned to the original preview tasks and removed both test tasks and the timer. This verified the preview reset and cleaned up the changes.

### Findings

- **Show where a just-saved task went.** A task due later today can land beyond Home’s three default rows. Both saves increased the number on **Show more**, and the preview toast simply said the preview was updated. Keep the short list and give the confirmation a **View task** action so a new user can verify the title and time without opening the backlog.
- **Use the same paused status across Home.** The banner said **Paused**, while the task row said **In progress**. In the scrolled view after **Back to my day**, the banner was above the viewport and the other start buttons appeared disabled without an explanation in the list. Label the row **Paused** and explain near the timer controls how to resume or end the existing session.
- **Make the recommendation easier to read at a glance.** At 4:23 PM the banner recommended the 10:00 AM task, with a 5:00 PM task visible lower in the list. The banner’s **One thing to start** copy gave me a small action, and I had to read timestamps to infer the ranking. Consider a short reason or a **Today** label so I can tell whether the suggestion is an earlier commitment, something coming up, or my active timer.

## Guided tour

**Take the tour** was visible in the preview strip. The guide opened at **Find your spaces**. **Next** advanced to **See what’s next**, **Back** returned to step 1, and **Skip tour** closed it. Reopening returned to step 1. I went through all eight steps and **Done** returned focus to **Take the tour**. From Settings, the same preview-strip button opened the guide on Home. **Close tour** returned me to Settings and focused the launch button. [Tour opening](private/local-priority-tour-start.png), [Home spotlight](private/local-priority-tour-home.png), [Final step](private/local-priority-tour-final.png)

### Findings

- **Teach one concrete first action on Home.** Step 2 highlights **Start 15 min**, but its copy lists tasks, routines, calendar, meals, and workouts without explaining why this particular task appears. Use this step to explain the chosen task and the first action in front of me. An invitation to try a sample timer, or a clear cue about where to do it after closing the guide, would make it easier to put the lesson into practice.
- **Match the UI label when introducing navigation.** Step 1 says to use the **Menu** button. The UI shows an unlabeled hamburger icon and exposes it to assistive technology as **Open navigation**. Use the control’s actual name or describe the icon beside the Tempo logo.
- **Check replay discoverability in the signed-in workspace.** Preview Settings had the persistent **Take the tour** strip above the page. Its Settings sections did not include a separate guide entry. The signed-in entry point was outside this walkthrough.

## Follow-up after the UI changes

The in-app browser became unavailable to the reviewer. Refreshing the previous tab, opening a fresh local preview, and resetting the browser session all returned a browser-unavailable error before the app loaded. The scores above cover the initial preview. The named save confirmation and **View to-do** action, revised paused row and timer guidance, protection of the existing focus session, and revised tour copy still need an independent walkthrough. No follow-up score or screenshot was recorded.
