# Independent phone review of Planner, Focus, Today and Journey

I tested the local Alex preview in the in-app Chromium browser on November 17, 2026. The review used the mobile changes collected in `3ba1406`, while that commit was being assembled. I worked on Daily rhythm and Brain dump. Another engineer authored the Planner changes.

The simulated customer was a time-pressed student fitting studio work around a changing shift. The professional review emphasized whether each task could be finished (40%), whether the result and its next action were clear (25%), reading and visual hierarchy (20%) and touch target reachability, focus and recovery (15%). These rounded scores describe the observed phone flows.

| Section | Score | Task and observed outcome |
| --- | --- | --- |
| Today | 9.1 | The primary card started the named project brief for 15 minutes. Finishing replaced it with the next open task. The lower list kept separate completion, timer and edit actions. [Today](15-today-cross.jpg) |
| To-do | 9.2 | Created an undated studio-key task from Done. View task returned to All and outlined the exact new row. Opened its edit form, chose Remove task, saw the task name in the confirmation, confirmed, and verified its edit row disappeared. [Saved row](17-task-cross.jpg) |
| Calendar | 9.0 | Nov 17 showed one sample event and three to-dos. Next day showed a different named event, two scheduled reminders and one workout task. Previous day restored the original date and rows. At 320px the first agenda item was readable above the bottom bar, and the document had no horizontal overflow. Long titles wrap and later entries need scrolling. [390px agenda](20-calendar-cross.jpg) · [320px agenda](21-calendar-320-cross.jpg) |
| Goals | 9.1 | Created a goal, added “Label one shelf,” and observed that specific goal show the linked step and 0 of 1 complete. The illustrated covers and progress read clearly. [Goals](18-goals-cross.jpg) |
| Reminders | 9.0 | Searching “gym” narrowed three records to one. The date read 5:30 PM EST. Change with Tempo opened an editable draft containing the correct text, full date, America/New_York and status. The sample does not exercise sending or editing a real SMS reminder. [Filtered reminder](19-reminder-cross.jpg) |
| Focus | 9.3 | Started, paused, resumed and finished a 15-minute task. The exact row appeared in Done. On a 320px screen I also paused a separate task, returned to my day, reopened its dock and stopped it. The message confirmed the task remained unfinished. [320px timer](22-focus-320-cross.jpg) |
| Journey | 9.1 | Opened the world, paused motion, advanced to First light, and saw its exploration state alongside the unchanged earned level. Selecting Nov 17 showed four saved checkoffs following earlier completions. [Journey](16-journey-cross.jpg) |

The viewport sizes were 390×844 and 320×568 CSS pixels. The browser used the fictional preview and its current-session state. The review did not exercise signed-in persistence, live providers, physical iPhone Safari, software keyboards or VoiceOver.
