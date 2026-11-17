# Desktop regression check

November 17, 2026. Independent returning-customer review of local fictional preview at port 3104, application commit `3ba1406`, Chromium viewport 1280 × 900. The reviewer used a separate browser session.

| Journey | Observed result |
| --- | --- |
| [Today](desktop/today.png) | Selected the 8:10 AM preview time. Compared the rendered page with the [prior desktop capture](../mobile-2026-11-16/desktop-today-candidate.jpg). The header, banner art, routine controls and side-by-side task list and calendar retained their positions. The day and date advanced. Desktop search, Spaces, customization and the Ask Tempo field were available. |
| [Fitness](desktop/fitness.png) | Opened Fitness through Spaces. The movement totals, history, saved plans and program library were accessible on the same page. Selecting Walk & unwind changed the pressed template and detail heading and exposed Schedule this session. The short-screen Activity/Programs switch stayed hidden. |
| [Routines](desktop/routines.png) | Opened Daily rhythm from the desktop navigation drawer. Morning and Evening appeared in two adjacent columns with separate progress bars and Start next step buttons. The single desktop New routine action remained available. |
| [Signup](desktop/signup.png) | Followed Get Tempo to the public signup form. The country control, phone input and one visible inline Get started button appeared in the existing desktop layout. The SMS consent checkbox and linked terms were accessible. No signup was submitted. |

The new responsive controls are hidden by default and enabled in the 760px phone media query. Shared behavior changes include keeping each food/fitness date independent, preserving pause when time is added, shortening edit dialog titles and displaying the early-access count only after a positive response. This review checked the four named flows. It did not measure visual equality across every desktop page or exercise live integrations.
