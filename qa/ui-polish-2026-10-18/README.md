# Workspace polish verification — October 18, 2026

Candidate: `codex/tempo-calm-ui`, UI changes based on `472fd02`.
Environment: isolated local candidate at `http://localhost:3101`, PostgreSQL
`tempo_ui_release`. No production data, paid model calls, or provider deliveries
were used in this pass. API spend: **$0**.

## What changed

- Neutral sidebar with stable four-group navigation; section colors remain in
  labeled inner destinations and page content. Breadcrumbs identify the current
  group and page. Account identity, Guide, and sign-out remain accessible.
- Separate frame stylesheet keeps navigation consistent across section themes.
  Today uses a smaller type scale, compact icons, quieter borders, and a clear
  current action. General page headers and routine introduction are shorter.
- Brief control, panel, dialog, and page feedback honors reduced-motion CSS.
  Hover intent delays incidental flyouts; click and keyboard alternatives remain.
- Arrow keys, Home/End, Escape, destination focus, and mobile drawer focus were
  refined. The selected mobile section tab scrolls into view without moving the
  document's reading position.
- Conversation height follows the viewport so recent messages and the composer
  are visible together. Mobile capture wording stays on one line.

References and limits: [planner research](../../docs/design-research/2026-10-18/planner-polish.md)
and [assistant/wellness research](../../docs/design-research/2026-10-18/assistant-wellness-polish.md).
Public official screens were inspected; authenticated competitor workflows and
exact animation timing were not observed. Timings used here are Tempo decisions.
No clinical benefit is claimed for the palette.

## Observed browser checks

Root used the actual candidate UI through CUA, with screenshots saved in this
directory. Desktop viewport was approximately 1265 × 712; mobile override was
390 × 844 and was reset after use. Full-page screenshots may be taller.

| Check | Observed result |
| --- | --- |
| Preview navigation | Today, To-do, Goals, Routines, Wake, Meals, Nutrition, Fitness, Thoughts and Ask rendered in the shared frame. Preview is visibly fictional and reset-on-reload. |
| Desktop keyboard | Planner ArrowDown/Right opens and focuses its first destination; End focuses Reminders; Escape closes and returns to Planner. Enter on To-do opens that page and focuses its named main region. |
| Mobile drawer | After repairing a visibility-transition focus race, opening focuses Close menu. Shift+Tab wraps to Guide; Tab wraps back to Close menu; Escape closes and focuses Open navigation. |
| Mobile destination | Selecting Nutrition closes the drawer and focuses the Nutrition main region. Selected tab lies fully inside the viewport (x≈121–271 at 390px width); no horizontal document overflow observed. |
| Chat composition | Final screenshots 15 and 16 show recent messages, input, Send and the preview disclaimer together on mobile and desktop. These are scripted preview messages, not model calls. |
| Saved account | Local QA Alex, phone ending 0199, is an authenticated synthetic account. Created “UI polish QA — packing list” through Capture, opened Thoughts, reloaded and confirmed title/body remained. Screenshot 18 records the persisted item. |
| Cleanup | Removed only that newly created fictional note through the normal confirmation dialog. After reload, its heading count was zero while the pre-existing “QA blue notebook” heading remained visible. |

## Independent review

[Independent review](independent-review.md): **8.7/10, scoped visual polish**.
The reviewer did not author the application changes. Its browser connection was
unavailable, so it independently inspected root's actual captures and source,
and explicitly attributed root's interaction observations. It found contrast,
focus-orientation and off-screen-composer problems; those were repaired and
rechecked. This is not an independent live integration or release approval.

Remaining nonblocking design tradeoffs: the Routines page still needs a scroll
to reach individual steps at short desktop heights (Today exposes the active
checklist), and goal cards reuse the same illustration.

## Validation and boundaries

Raw **`npm run check` exited 0**: lint and typecheck passed; **106 test files
passed / 2 skipped, 810 tests passed / 3 skipped**; production Next.js and
operations builds passed. Tests took 163.14 seconds. The skipped opt-in
infrastructure cases were not executed in this visual pass. `npm-check.log`
is local command evidence; expected negative-case provider/authorization logs
in that passing suite are simulated errors, not live billing results.

The compiled build was served with `start-built-candidate.cjs` using an
allowlisted environment, no providers and the same isolated database. Its
loopback server is left at port 3101 (launcher PID 23072, child PID 4160).
Actual compiled-browser checks: Today rendered correctly; checking the first
evening routine step changed 0/3 to 1/3, updated the next-step button from
5 to 3 minutes, and showed an honest preview status. Food & fitness opened
its flyout and Nutrition navigation focused the named main region. Captures
20 and 21 document these checks. No captured console warnings/errors were
reported in that fresh compiled tab. Preview was then reloaded to reset its
temporary state and retained as the user-facing deliverable.

Actual hover-pointer traversal, 200% zoom, screen-reader output, OS reduced-motion
rendering, and a physical touchscreen were not exercised. Reduced-motion behavior
was checked in source only. Phone-sized browser checks do not prove a real mobile
keyboard's behavior.

Backend handlers, provider adapters, schema, consent and authorization policies
are unchanged. A local save/reload check is evidence for that workflow only.
Existing candidate live-SMS/Google integration and release gates remain open;
production is unchanged. No new staging service or charge was authorized here.
