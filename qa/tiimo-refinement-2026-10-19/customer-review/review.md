# Independent simulated customer review

Reviewed 2026-10-19, approximately 11:43–11:48 America/New_York. Candidate: commit `6d45d53` plus working changes supplied by parent, isolated Next.js development server at `http://localhost:3101/workspace/preview#today`. Separate agent-created Codex in-app Browser tab; no root or Tiimo tab controlled. Screenshots and DOM observations from this run. No code edits, real-account actions, SMS, model calls, or persistence checks. This is a simulated novice/neurodivergent customer perspective, not a clinical study or actual customer research.

Desktop screenshot width 1265 CSS pixels. Mobile viewport requested 390×844, but observed DOM and captured output measured 375 CSS pixels wide (clientWidth, bodyWidth, scrollWidth all375); browser-scoped viewport may have been shared with simultaneous parent review. Record mobile evidence as observed375px rather than claiming390. No horizontal overflow observed.

## Verdict and scores before repairs

Overall **7.5/10**. Desktop is calm and clear, and the next action remains strong. Mobile Today has a material banner reflow defect. Scores are judgment of observed usability, not measured user outcomes or forced acceptance scores.

| Changed area | Score | Evidence and judgment |
|---|---:|---|
| Today hierarchy / What's next | 8.5 | 01,08: one large next action and three later events; large Start button. Two lists repeat some task titles, but clear separation supports quick action versus planning. |
| Optional startup questionnaire | 8 | 02–04,11–12: three short choices, progress count, skip, back, clear no-text-enablement reassurance. Save/reopen works within preview. Skip success wording is misleading. |
| Optional streak | 8.5 | 04,05,07,13: can hide/show, informative seven-day disclosure, no loss/shame wording, sample/reset disclosure. Hidden mode removes entire card. |
| Routine/checkoff feedback | 8.5 | 08: completion2/4→3/4, progress bar and next row update, daily completions2→3; Enter uncheck restores2/4. Routine status offers Undo. |
| On-demand navigation | 8 | 06,14: concise categories, settings under account, current Today visible; mobile menu Escape returns focus to Open navigation. Settings needs an extra discovery step, but is conventional. |
| Mobile Today clarity | 6 | 10,13: post-setup banner squeezes copy to a narrow column, grows to roughly285px, pushes Start below initial screen. Needs responsive stack/wrap of action. |
| Keyboard behavior | 7 | Native radio arrow keys work; Continue Tab wraps to Close setup; heading receives focus between steps. Setup Escape closes but leaves activeElement BODY rather than opener, confirmed again later. Restore focus to Personalize Tempo. |

## Numbered flow steps and health

1. **Desktop arrival — healthy** (`01-desktop-today.jpg`). Strong Your Monday heading, clear fictional/reset banner, optional setup, compact streak, lavender next-task card, routine/to-do panel. Task action dominates the work area. Secondary text is visually light and small; contrast not instrument-measured.
2. **Setup name — healthy** (`02-setup-name.jpg`). Dialog labels the optional name, states three choices, offers Skip for now and Continue, explains no text check-ins enabled. Entered fictional name Sam.
3. **Support choice — healthy** (`03-setup-support.jpg`). Three understandable full-width radio choices with short descriptions. Selected A gentle nudge; current selected state is visually distinct. ArrowDown moves to next native radio choice.
4. **Progress preference — healthy** (`04-setup-progress.jpg`). Selected Keep numbers out of it, then Make it mine. Gentle copy makes opting out valid, and preserves the possibility of returning later.
5. **Save / hidden streak — healthy with wording issue** (`05-saved-hidden.jpg`). Notice says Choices updated in preview. They reset on reload. Streak card removed; name shows Sam in account menu. Returned via Menu→account/settings→Personalize Tempo: name Sam and gentle radio retained. Changed name to Discard me then Skip: reopening still showed Sam, so unsaved edit discarded. However Skip emitted the same Choices updated notice, falsely implying edits applied. Prefer Setup skipped / Your previous choices are unchanged.
6. **Navigation / reopen — healthy** (`06-navigation.jpg`). Four app categories, Today and Ask Tempo shortcuts, account/settings entry. Menu Escape later verified focus returns to Open navigation. Settings exposes Personalize Tempo, matching its content description.
7. **Streak restore / explanation — healthy** (`07-streak-expanded.jpg`). Returned through setup to Show my activity streak; card reappeared. Disclosure explains eligible actions, all of today remaining, preserved earlier progress, and fictional preview state. Seven dates fit visibly.
8. **Routine completion — healthy** (`08-routine-checked.jpg`). Routine tab: checked Breakfast & a moment to yourself. Count2/4→3/4, check/strike-through, progress bar, Next highlight moves to Choose one thing for today; streak total2→3. Enter on Uncheck returned2/4 and streak2. Completion toast has Undo.
9. **Mobile first-screen Today — needs repair** (`10-mobile-top.jpg`). Post-save reassurance banner retains mascot, squeezed copy, and action in one horizontal row. HERE WITH YOU becomes three lines, headline five lines, description about seven lines. Next task starts at bottom; Start action lies below viewport. Stack CTA or give copy full usable row width. `09-mobile-today.jpg` is rejected as primary evidence because full-page capture at scrolled/focused state placed sticky header across content; use10 instead.
10. **Mobile name / support — healthy** (`11-mobile-setup.jpg`,`12-mobile-support.jpg`). Dialog fits visible375px screen, name input and footer accessible, support radio cards readable and Continue visible. Focus at support step is its h2; Tab enters radio group; Continue Tab wraps to close. Escape closes but activeElement becomes BODY instead of opener, losing keyboard position.
11. **Mobile streak disclosure — healthy** (`13-mobile-streak.jpg`). Seven days and explanatory text fit width without clipping. Disclosure appears over underlying Today content; easy to collapse via same summary. Banner defect remains visible above.
12. **Mobile menu — healthy** (`14-mobile-menu.jpg`). Large rows, concise names, account and guide clear. Escape closes and returns focus to Open navigation.
13. **To-do completion — recovery gap** (`15-mobile-todo-done.jpg`). Completed Practice the first four guitar chords; list7open→6open and next item filled shortlist. Status says Updated in preview. Sample changes reset on reload. Unlike routine, no Undo exists in this state; immediate accidental-completion recovery is unclear. Optional follow-up unless task completion recovery is in current scope. No attempt to use real account.

## Tiimo comparison

User-supplied reference files reviewed: `01-tiimo-desktop-home.jpg`, `02-tiimo-routine-editor.jpg` and mobile clipboard images `codex-clipboard-b985dc2b-cbac-458c-8119-791f1c7ecb9e.png` and `codex-clipboard-01aafb34-36b3-4b0d-887c-ec16aceb588e.png`. These are explicitly supplied comparison evidence; Tiimo itself was not controlled.

Tiimo's mobile agenda uses compact streak indicators, large date context, readable activity rows and time-of-day bands. Tempo now shares the readable date, checkoffs, restrained color coding, optional progress, and routine separation while adding a much clearer single next action on desktop. Tempo's explicit completion labels/counts and direct start button reduce guessing compared with small unlabeled icons in the supplied references. Tiimo's supplied mobile screenshot keeps row text at useful width; Tempo's squeezed reassurance banner fails that lesson. Tempo's progress disclosure explains what counts and avoids making a broken streak erase earlier effort, useful for users who experience number pressure. No claim of matching Tiimo's complete feature set or live behavior.

## Required repairs / limits

Before rescoring mobile or keyboard at8+: fix mobile banner copy width/action placement, and restore setup focus on close/Escape. Correct Skip status wording. Optional: add immediate to-do completion Undo.

Preview is fictional and explicitly resets on reload. Saved choices here establish only in-memory UI behavior. Parent will supply separate persistence/test evidence; none was reviewed during this run. No screen reader, physical device, touch ergonomics, browser zoom, measured color contrast, production build, authentication or backend delivery validation. The screenshot artifact at09 is not used to diagnose fixed-position bugs. Review allowed existing hot reload/working changes; any subsequent fixes require a recheck and updated scores.

## Second review attempt

Parent reported repairs ready for mobile banner, setup focus restoration, Skip wording, and to-do Undo. An independent second pass was attempted through CUA only. Prior browser2 was unavailable; fresh inventory returned `apps: [], browsers: []`. Resetting the CUA kernel and repeating its required initialization returned the same empty inventory. No repaired UI was observed, no fresh screenshot was captured, and no updated score is assigned. The scores above describe only the original observed candidate and must not be presented as scores of the repaired candidate. Parent's separate authenticated checks are not independent review evidence from this agent.

## Repaired candidate: secondary evidence review

The parent subsequently explicitly supplied fresh screenshots and interaction records for a secondary review. This section updates the scoped judgment of the repaired candidate based on those materials plus narrow source inspection. It is **not a second independent browser interaction pass**. The attempted independent browser reconnect still failed after `cua.rewriteDocumentation()` and a browser2 tab listing.

Accepted evidence viewed directly:

- `../16-mobile-repaired.jpg`: fresh first-use mobile Today.
- `../17-mobile-returning.jpg`: after Skip, returning mobile Today with skip notice.
- `../task-undo-browser.txt`: actual parent-captured complete/Undo DOM snapshots.
- `../persisted-account-after-reload.txt`: actual parent-captured isolated authenticated Today after reload, showing1-day streak and1completion today.
- Parent's explicit CUA interaction report: saved direct tone and hidden streak survived reload and form reopening; setup Escape yielded `dialogOpen:false` and activeElement text `Personalize Tempo `; routine0/4→1/4 and streak0→1, Undo returned both0, then recheck/reload retained1day/1completion; proactive consent remained unchecked. These interactions are **reported by parent**, not independently repeated here.
- Source inspected: `src/app/workspace/GentleSetup.tsx` closes native dialog and restores connected opener focus in effect cleanup; `WorkspaceClient.tsx` has distinct Skip notice; `today.module.css` uses48px+fluid mobile grid and second-row CTA, hiding returning intro kicker/description. Source inspection supports intended mechanics, not a substitute for measured browser behavior.

### Updated scores

| Area | First hands-on score | Repaired scoped score | Basis |
|---|---:|---:|---|
| Today hierarchy / What's next | 8.5 | 8.5 | Retained single strong next action, now visible within fresh mobile screenshots. |
| Optional startup questionnaire | 8 | 8.5 | Prior readable optional flow retained; screenshot17 says Setup skipped and names Settings return path; reported saved choices survive reload. |
| Optional streak | 8.5 | 8.5 | Prior show/hide/disclosure good; supplied post-reload DOM supports recorded progress display. |
| Routine/checkoff feedback | 8.5 | 8.5 | Prior independent routine reversal worked; parent reports saved checkoff/reload and now task Undo restores task. |
| On-demand navigation | 8 | 8 | No evidence warrants a score change; prior menu behavior adequate. |
| Mobile Today clarity | 6 | 8 | Direct screenshot comparison resolves narrow-column defect. First-use banner copy reads normally; returning banner is compact; Start15minutes fits first viewport in16 and17. Header/demo/context still consume substantial height, so this is good rather than exceptional. |
| Keyboard behavior | 7 | 8 | Parent-reported Escape focus restoration plus native modal cleanup source resolves the named failure; earlier independent radio/trap checks passed. Full screen-reader and keyboard suite remain untested. |
| **Overall scoped usability judgment** | **7.5** | **8.2** | Main observed barrier repaired, scope-specific verification gaps retained. Not a research score or an arithmetic acceptance gate. |

### Repaired flow steps / health

1. **Fresh mobile first-use — healthy** (`16-mobile-repaired.jpg`). Mascot occupies left48px; copy gets usable right width; Make it mine on second row. Full Start15minutes button visible. Compared with10, the improvement is concrete and substantial.
2. **Skip and returning mobile — healthy** (`17-mobile-returning.jpg`). Compact reassurance headline, clear Help me get started action, readable streak, Start15minutes visible. Notice truthfully says Setup skipped. You can personalize Tempo in Settings.
3. **Setup Escape — named issue resolved in supplied evidence** (parent interaction report + `GentleSetup.tsx`). Native dialog closed and opener restored to Personalize Tempo. Not independently re-run.
4. **Task completion and Undo — healthy recovery** (`task-undo-browser.txt`). Complete removes grocery task,7open→6open, and status names the task plus Undo. Undo restores task and7open, with later planned count2→3. The3completions streak count remains3 after Undo by deliberate recorded-credit design. That is distinguishable from routine Undo and may require the history explanation; no claim that Undo fully erases recorded activity.
5. **Saved setup and routine progress — supported by parent record, not independently verified here** (`persisted-account-after-reload.txt` + parent interaction report). Post-reload1day/1completion is visibly recorded. Tone, hidden streak, routine reversal/recheck and unchecked proactive consent are parent-reported actual isolated-account checks.

### Before / after visual evidence

Original mobile defect:

![Original narrow mobile banner](10-mobile-top.jpg)

Repaired first-use mobile:

![Repaired first-use mobile](../16-mobile-repaired.jpg)

Repaired returning mobile and truthful Skip:

![Repaired returning mobile](../17-mobile-returning.jpg)

Remaining polish: secondary copy is small/light; no instrumented contrast audit. Mobile still places optional encouragement and streak above the next action, but both supplied repaired screenshots now show the Start action. Task Undo retains historical completion credit; the history explanation should remain accessible and understandable. No further scope-blocking usability defect is established by the supplied evidence. Current build/check result was pending and is not claimed by this review. No live integrations, model quality, SMS delivery, production behavior or clinical outcome is evaluated.
