# Bounded customer review — 2026-10-22

**8/10 for the new pilot experience reviewed:** explicit time-zone confirmation, private feedback, and thought → task → timer → completed thought preservation. The screens explain the important choices without requiring a customer to understand the implementation. Two small usability gaps remain below. This is a reviewer judgment from supplied evidence, not a whole-product, provider-readiness or observed novice-completion score.

## Evidence and limits

I personally inspected `01-settings-timezone.png`, `02-feedback-form.png`, `03-feedback-saved.png` and `04-thought-completion-phone.png`, read `activation-feedback.md` and `customer-release-matrix.md`, and inspected the relevant UI source. I did not interact with the browser, query a database, run tests or call providers. No paid APIs were used. This review changes only this document.

Root reports an authenticated localhost run in which London persisted after reload; feedback follow-up remained unchecked; success moved focus to its heading and Done restored opener focus; a 390 × 844 mobile viewport had no horizontal overflow; and a thought became one six-minute task, its timer was completed, and the original thought remained after reload. Those are root's observations, not independent interactions by this reviewer. The screenshots corroborate the visible end states but cannot independently establish persistence, focus behavior, timer operation or database durability.

The release matrix is a planning snapshot: its time-zone and feedback gaps predate the supplied A2 evidence. Its other acceptance requirements remain outside this review. No unfamiliar participant was observed, and timer controls/intermediate conversion screens are not included in the four screenshots.

## Findings

1. **P2 — A saved report has no explained route back to help.** In `src/app/workspace/PilotFeedback.tsx:47`, the receipt says, “Keep this reference if you need to ask about your report.” The phone screenshot shows a long wrapping UUID and Done, without a copy control, retrieval route or contact instruction. A customer who is already stuck must decide how to preserve it and where to ask. `activation-feedback.md` also confirms there is no customer list/detail endpoint or established response SLA. Add a copy-reference action and a concrete pilot contact instruction, or supply that instruction consistently in the pilot handoff. Explain whether a response is expected without promising an unstaffed turnaround. This does not prevent submission, but it weakens the recovery path.

2. **P2 — Completion is visually too quiet on the preserved thought.** The phone screenshot shows “Completed: Choose one basil pot” below the original body in much smaller, pale text. `src/app/workspace/ThoughtsView.tsx:40` renders this key state with `s.finePrint`; `src/app/workspace/workspace.module.css:146` defines that class at 10px with `#929d87`. A returning customer may see the original idea and Open task but miss that the chosen step is already finished. Use a readable task-status line or badge with sufficient contrast while retaining the exact task title and Open task action. This finding concerns visible hierarchy, not an independently measured contrast audit or a claimed data-loss defect.

## What works for a novice

- **Time zone:** “London · Europe,” “Confirmed,” and the disabled “Time zone confirmed” button make the saved choice legible. “Existing reminders keep their scheduled moment. This does not turn on text check-ins” sets useful limits. Source also labels changed drafts unsaved and asks for confirmation after a device suggestion. The custom-city fallback requires an IANA-style identifier, so the device choice/common cities are the easier path; that fallback was not exercised here.
- **Feedback:** Familiar questions, optional detail, initially unchecked contact permission and “No chats, tasks, phone number or screenshots are automatically attached” lower the decision burden. “Your report is saved” confirms an outcome without implying a fix. “You did not request a follow-up” accurately reflects the pictured choice. The three selects are manageable for a short pilot form.
- **Thought preservation:** The original title/body, the exact resulting task title and “A thought can become a next step. Your original note stays here” explain the relationship. Open task offers a direct return path. Root's attributed reload result supports the intended reassurance that acting on an idea does not erase it.

No blocking usability defect was identified in the evidence inspected. The bounded flow is suitable for a guided first-ten pilot once the report-follow-up route is explained; the score does not resolve the separate operational, provider or broader release gates in the matrix.

## Re-review and closure — 2026-10-22

**Final bounded score: 9/10**, superseding the initial 8/10 above. I inspected `05-feedback-copy-phone.png` and `06-thought-status-phone.png` plus the changed UI text/styles. Both findings are closed for this pilot scope:

- **Receipt recovery:** `PilotFeedback.tsx:60` now says, “To add more information later, open Report a problem in Settings and include this reference in your new report.” A labelled, selectable reference field and Copy reference button make the next action concrete. The supplied phone screenshot displays “Reference copied.” Root separately reports clicking Copy reference, seeing that status, and returning focus with Done; I did not personally exercise clipboard or focus behavior. The new route is another report quoting the reference, rather than a customer report-history page or a promised human reply. That is an understandable, honest pilot expectation.
- **Task completion visibility:** `ThoughtsView.tsx:40` now uses `n.taskStatus`, defined in `thoughts.module.css:7` at 14px in dark `#51435e`. The updated phone screenshot makes “Completed: Choose one basil pot” readable alongside the unchanged original title/body and Open task. This directly addresses the original hierarchy finding; I have not performed a measured contrast audit.

No open substantive usability finding remains within these reviewed additions. The score remains limited by screenshot/source review, attributed root interaction evidence, and the absence of an observed unfamiliar participant completing the flow. It does not certify the rest of Tempo, operational triage ownership, response times or live provider delivery.
