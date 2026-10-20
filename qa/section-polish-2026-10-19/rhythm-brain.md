# Daily rhythm and Brain dump polish — 2026-10-19

## Primary-source evidence

Reviewed public official product documentation, not signed-in competitor sessions:

- [Tiimo Focus](https://www.tiimoapp.com/product/focus): shows a countdown and checklist steps together. Tempo retains its real step progress and next-step action, with a restrained morning/evening accent. Existing local Tiimo observations in `qa/tiimo-refinement-2026-10-19/RESEARCH.md` also informed this hierarchy; no competitor artwork was copied.
- [Structured getting started](https://help.structured.app/en/articles/380546): explains daily anchors, tasks, subtasks and an inbox. Tempo keeps routines grouped by morning/evening and keeps captured thoughts distinct from tasks.
- [Finch creating and completing goals](https://help.finchcare.com/hc/en-us/articles/37779940291213-Creating-and-Completing-Goals): describes completing small goals and editing them. The adaptation is modest, editable steps and a visible time estimate, without importing Finch's rewards or pet system.
- [Bear search](https://bear.app/faq/how-to-search-notes-in-bear/): places search at the note list and searches while typing. Tempo adopts an immediate search field, result count and a quiet reading list. Advanced operators, attachments and OCR are not implemented or implied.
- [Apple Notes search](https://support.apple.com/en-ie/guide/iphone/iphb8628c6b8/ios): documents keyword search across notes and within note content. This supports the separately integrated title/body thought search, rather than invented categorization.

These are design inferences from documented product patterns, not evidence of clinical benefit or universal user preference.

## Implementation

- Removed the extra outer rounded frames. Morning/evening routines use warm and muted violet accents, thin progress and quieter dividers. The visible check circle is smaller while the button remains 44 by 44 pixels.
- Brain dump uses a violet notebook margin, serif thought titles and thin separators. Root integration supplies `ThoughtsView.tsx`, title/body search, readable excerpts, empty-search recovery and existing callbacks.
- Memories use a reading list, searchable text/categories, a live result count and an expandable explanation of saved-context and conversation-history semantics. Correction/removal actions retain their existing callbacks and disabled states.
- Routine editor steps use separators in place of stacked bordered boxes, keep arrow-based reordering and accessible labels, and show the current draft's step count/time in the footer.
- Sunrise/sunset uses a selection rail and a quiet light canvas. The on-demand scope, usual-alarm reminder, physical-brightness limitation, synthesized sound labels and explicit start behavior remain visible. No scheduling capability was added.

## Verification

Background CUA tab at `http://localhost:3101/workspace/preview`; no shared viewport changes. Captured `rhythm-before.png`, `brain-before.png`, `rhythm-after.png`, `brain-after.png`, `memories-after.png`, `routine-editor-after.png`, `wake-after.png`, `wake-session-after.png`, and `wake-complete-after.png` beside this file. The before/after captures are fictional demo data.

Observed in the local browser:

- Searching memories for `  routine  ` shows one of three records and matches the saved category. Clearing restores all three. Expanding the explanation shows the conversation-history caveat.
- Routine editor Add step adds step five, updates the time/count summary and focuses the new input. Cancel returns to the four-step routine without saving.
- A silent 20-second sunrise preview counted down from 20 to 4 to 0, with corresponding progress values 0, 0.826 and 1. Completion changed the title and exposed Done. Done returned to settings. Selecting Sunset changed the copy and start action. No audio/provider call was made.
- Integrated Thoughts search/list renders with all three original fictional notes and their edit/remove/conversion actions.

Commands actually run:

- `npm run test -- src/app/workspace/RoutineEditor.test.ts src/app/workspace/SavedContextViews.test.ts src/app/workspace/wake-session.test.ts`: 3 files, 23 tests passed.
- `npm run lint`: passed, including a final rerun after the last CSS change.
- `npm run typecheck`: final rerun passed. An earlier run caught the root agent's then-in-progress `ThoughtsView.tsx` narrowing error; root corrected it before the passing rerun.

No production changes, paid API calls, migrations, commits, builds or server restarts. Mobile viewport validation remains part of root's integration pass; desktop screenshots do not establish mobile behavior. Actual device audio/fullscreen/wake-lock failure modes were not exhaustively tested.
