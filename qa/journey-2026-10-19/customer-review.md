# Tempo Journey: independent novice customer review

Date: 2026-10-19. Surface: local fictional preview, http://localhost:3101/workspace/preview. Reviewer lens: a first-time visitor who feels overwhelmed and needs low-effort, reassuring controls. This is an agent usability review with actual browser interactions, not a clinical study or research with people who have ADHD, anxiety, depression, or autism.

## Initial score: 8/10

The page gives me a welcoming place to notice progress. I can discover it from Today, explore the trail, read a gentle daily note, and get back to my day without uncertainty. Numbers agree with a real preview checkoff. The scenery and whitespace are calming, and the copy avoids punishing a missed day. I would still encounter two avoidable burdens: my motion pause is forgotten when I return, and the direct progress-display link makes me complete unrelated setup screens. Those issues keep the score at 8 and require a recheck after fixes.

## Actual steps and results

1. **Find Journey from Today — healthy.** Clicked the visible top `Your journey 02` button. The page changed to a scenic trail with a clear heading and a `Today 01` return control. The existing breadcrumb still says Today, which is understandable as the parent area but slightly less exact than the active page.
2. **Explore milestones — healthy.** Selected Level 3. The stop showed a selected outline, and the explanation changed to `A week of days, at your pace` with `5 more active days`. It explicitly says the days need not be consecutive. Current progress stays clearly labeled Level 1 beneath the illustration. See customer-02-milestone-explanation.jpg and customer-08-phone-clear.jpg.
3. **Understand levels, streaks, and wins — healthy with reading effort.** Expanded `How your journey grows`. It explains that the first saved checkoff in a day adds an active day, additional unique checkoffs add wins, repeated checkoffs count once, and undo corrects totals. Levels use total active days while streaks use consecutive days. The explanation is comprehensive, though dense for an overwhelmed reader.
4. **Read encouragement — healthy.** A dated note says `Let today be a small chapter, if that’s what you need.` It is gentle, separate from metrics, and still available with numbers hidden. The explanation says the note is written by Tempo rather than generated from personal records. This review did not advance the date or prove day-to-day rotation.
5. **Pause animations and celebrate — partly healthy.** `Pause animations` changed to `Enable animations`. Celebration still gave a quiet textual confirmation: `That’s 4 little wins worth noticing.` See customer-03-celebrate-paused.jpg. **Defect:** after `Back to my day` and returning to Journey, the control reverted to `Pause animations`, re-enabling motion. I should not have to repeat a comfort preference each visit.
6. **Complete a fictional step and revisit — healthy.** Checked off `A five-minute tidy` in Today. The routine moved 0/3 → 1/3; Today completions 2 → 3. Journey changed total wins 4 → 5 and today's wins 2 → 3; active days stayed 2, current streak stayed 2, and Level 1/next-level progress stayed correct because today was already active. See customer-04-progress-updated.jpg.
7. **Hide numbers — outcome healthy; route needs improvement.** `How your journey grows` → `Change progress display` opened name setup at step 1, then required Continue through tone setup at step 2 to reach progress at step 3. Selected `Keep numbers out of it` and saved. Journey removed level stops, active-day totals, win/streak totals, and seven-day activity dots, retaining the scenery, note, and return action. See customer-05-numbers-hidden.jpg. **Defect:** the specifically named display link should take me directly to the relevant setting rather than unrelated setup steps.
8. **Phone layout and interaction — healthy.** Tested the browser viewport at 390×844; captured rendered phone content at the browser's resulting narrow viewport. Trail stops stayed usable and selected Level 3 correctly. The layout stacked cleanly, note and stats were readable, return action was clear, and no text overlapped in the unobstructed view. Motion control becomes icon-only but retains an accessibility label. See customer-06-phone-numbers-hidden.jpg and customer-08-phone-clear.jpg.

## Highest-impact changes

- Preserve the visitor's animation pause when leaving and returning to Journey. Treat the explicit choice as a session preference, ideally a saved browser preference, and continue honoring operating-system reduced motion.
- Open a focused progress display setting from `Change progress display` (or start the existing setup at its progress step). Do not ask for name and coaching tone just to hide numbers.

## Accessibility observations and limits

The browser accessibility tree exposes meaningful level names and remaining days, checked states for selection, a labeled progress indicator, and a labeled motion control even on phone. The visible selected outline and textual explanation provide more than color alone. The paused celebration retained textual feedback. These are positive observations, not a full WCAG conformance claim. I did not test an actual screen reader, high zoom, contrast ratios, every keyboard path, system reduced-motion configuration, live account persistence, provider behavior, or real SMS delivery. No messages were sent, and no real account was changed.

## Evidence

All JPEGs are current-run browser captures, saved and then reopened/inspected locally. Preview fixtures explicitly state they reset on reload. Screenshots are local QA artifacts.

![First impression](customer-01-journey.jpg)
![Selected milestone and explanation](customer-02-milestone-explanation.jpg)
![Paused celebration](customer-03-celebrate-paused.jpg)
![Progress after a fictional routine checkoff](customer-04-progress-updated.jpg)
![Numbers hidden](customer-05-numbers-hidden.jpg)
![Phone with numbers hidden](customer-06-phone-numbers-hidden.jpg)
![Phone milestone and clear layout](customer-08-phone-clear.jpg)

## Recheck

Pending the two fixes above. Initial score remains 8/10 until the changed flow is exercised again.

## Recheck complete: 9/10

Reloaded the preview deliberately after the fixes and repeated the affected flow. Both original defects are resolved in the tested session. My score rises to **9/10** because the visitor can now keep motion paused while moving around the workspace and reach the display choice with one direct action. This remains a reasoned agent assessment, not a measured outcome from a participant study.

1. **Motion preference — healthy after repair.** Paused motion, used Back to my day, completed a fictional routine step, and returned: `Enable animations` remained selected. Then visited Calendar through the menu, returned to Today, and reopened Journey: still paused. The control now explains that the choice lasts while the workspace is open. Full-reload persistence is not promised; I did not treat that limit as a failed repair. Screenshot customer-10-paused-after-section-navigation.jpg shows the paused quiet view after section navigation.
2. **Focused display setting — healthy after repair.** `Change progress display` opens `Progress, your way` directly with Cancel and Save display. Selecting hidden numbers and cancelling leaves metrics visible. Opening again, selecting hidden numbers, and saving removes metrics. `Personalize Tempo` in that quiet view opens the same focused setting and restores metrics when saved. No unrelated name or tone steps. See customer-09-focused-progress-modal.jpg.
3. **Progress regression — healthy.** Repeated the preview routine checkoff from the fresh fixture: wins 4 → 5, today 2 → 3, active days and streak remain 2. These values survived Calendar navigation and display preference changes. A paused celebration added `That’s 5 little wins worth noticing` without changing the totals.
4. **Phone milestone regression — healthy.** At requested 390×844 viewport override, selected Level 3. The selected ring appears and the detail now names `Finding your feet`, making the number-only phone stop easy to identify. Read-only DOM measurements show all six milestone buttons are 44×44 CSS pixels and their rectangles do not overlap at the tested narrow layout. See customer-11-recheck-phone.jpg.
5. **Keyboard sample — healthy.** Focused the Level 4 button through the browser locator and sent Space. Level 4 selected, the detail changed to `The open trail` and `12 more active days`, and a distinct focus outline remained visible. This tests activation and visible focus for a sampled milestone; it is not a complete keyboard navigation audit. See customer-12-keyboard-phone.jpg.

Remaining opportunities are polish: the long explanatory disclosure could be easier to scan, and the illustrated trail is a large part of the phone page before the daily note. Both are acceptable given the clear return controls, meaningful hidden-number alternative, and the page's optional reflective purpose. No new blocking issue was observed. Browser viewport restored after testing.

![Focused progress setting after repair](customer-09-focused-progress-modal.jpg)
![Pause retained after visiting Calendar](customer-10-paused-after-section-navigation.jpg)
![Revised phone milestone selection](customer-11-recheck-phone.jpg)
![Space key selects Level 4 with visible focus](customer-12-keyboard-phone.jpg)
