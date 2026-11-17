# Phone planner and cross-review

November 17, 2026 · local fictional Alex workspace on port 3104 · candidate changes over `5c07fb4`. Browser review used 390 × 844 and 320 × 568 CSS pixels. All interactions used ordinary UI controls in a private preview tab. This evidence concerns preview usability. It does not measure authenticated persistence, SMS delivery, Google connectivity, real user satisfaction, VoiceOver, or a physical iPhone keyboard.

## What changed after using the phone app

1. Today’s small square cropped the focus photograph into an indistinct thumbnail. The image now takes the right edge of the activity card, with a fade behind the task title. Finishing a timed task immediately moved the hero to the next task. [Before](01-today-before.jpg) · [After](09-today-after.jpg)
2. To-do repeated destructive and timer controls on every row and stacked the Add action below the filters. At 320px all four filters and Add now fit on one line. The task title opens its editor with Remove and a confirmation. A student created an undated lab task, found it with View task, cancelled removal, then confirmed removal and saw the row leave. During a walk timer the walk offered Open timer and other tasks’ start buttons were disabled. [Before](03-tasks-before.jpg) · [After](11-tasks-after.jpg) · [320px](16-tasks-320.jpg)
3. Focus could start the clock when a paused customer requested another five minutes. After the fix, pausing a 15-minute task and adding five minutes showed **20:00 paused**. Resume and Done closed the timer, advanced Today, incremented completed tasks, and updated linked goal progress. [Paused timer](10-focus-paused-after.jpg)
4. Calendar lost its item-type visual cues at narrow widths. Time labels and colored source markers now make it easier to scan a mixed day. Moving from Tuesday to Wednesday changed the selected date and returned Wednesday’s one event, one task and two reminders in chronological order. [Before](04-calendar-before.jpg) · [After](14-calendar-after.jpg)
5. Goals used much of the phone screen for the first card’s landscape and intro. The compact illustration keeps the next step within reach. Editing a fictional goal description updated the same card. [Before](05-goals-before.jpg) · [After](12-goals-after.jpg)
6. Reminders repeated two headings and introductions before the first item. The actions and search now lead, and local times use the abbreviation for each scheduled instant. Other zones retain their full identifier. Searching “gym bag” found one of three items and opened the precise edit draft in Ask Tempo. A regression test distinguishes the repeated hour across the fall clock change. [Before](06-reminders-before.jpg) · [After](13-reminders-after.jpg)
7. Journey’s opening screen showed the world but put progress below the fold. Level and streak now share the opening screen when enabled. Choosing Next selected the locked First light milestone. Switching off progress in setup removed numeric indicators. [Before](07-journey-before.jpg) · [After](08-journey-after.jpg)

## Independent review of the Daily rhythm and Brain dump team's work

The simulated reviewer was a commuting student with a few minutes to plan between shifts. Scores weigh finishing the intended task (40%), finding the action (30%), readability and touch layout (20%), and recovery or feedback (10%). Scores describe the user-visible workflow tested.

| Section | Score | Action and outcome |
| --- | ---: | --- |
| Routines | 9.2 | Chose Evening, opened New, confirmed Evening and 21:00, saved a one-step routine and checked it off. Progress updated to 1/1. [Screen](17-rhythm-review.jpg) |
| Sunrise & sunset | 9.1 | Switched to Sunset, tried the silent 20-second session, inspected its countdown, and ended it. Device limits were readable. [Screen](18-wake-review.jpg) |
| Thoughts | 9.2 | Captured “Reserve the quiet room” with a detail, searched it, converted it into a task, and saw the source note survive. [Screen](19-thoughts-review.jpg) |
| Memories | 9.0 | Searching “lunches” narrowed three records to one. Correct with Tempo quoted the matching memory in a draft. [Screen](20-memories-review.jpg) |
| Ask Tempo | 9.0 | Edited the correction draft, observed an available Send action and the preview disclosure, and navigated away without sending. Live response quality was outside this check. [Screen](21-ask-review.jpg) |
| Settings | 9.1 | Jumped to Text check-ins and focus moved to its heading. Adjusted the native time field with an arrow key and saved 22:01 with the preview-only confirmation. [Screen](22-settings-review.jpg) |
| Onboarding & guide | 9.2 | Entered Riley, selected direct coaching and hid streaks. Today greeted Riley and Journey omitted numeric progress. Traversed all eight guide steps, then used Done. [Screen](23-onboarding-review.jpg) |

The evening routine name placeholder still said “Morning routine” in the reviewed build. This was reported to its author. The browser input wrapper’s time-field fill did not commit the change during the first Settings attempt. Native keyboard adjustment committed and saved correctly. Real iPhone picker behavior still needs a device check.

The independent Rhythm reviewer scored the revised Planner experience at Today 9.1, To-do 9.2, Goals 9.1, Calendar 9.0, Reminders 9.0, Focus 9.3 and Journey 9.1 after exercising those flows in a separate session. Coverage includes scoped task removal, adding a linked goal step, switching Calendar dates, drafting a reminder correction, timer recovery, and milestone selection.
