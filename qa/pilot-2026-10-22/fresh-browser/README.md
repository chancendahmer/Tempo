# Fresh authenticated browser evidence

Root reviewer, October 22, 2026, adaptive worktree over `3892b74` plus the current uncommitted continuation. This is a local synthetic account at `http://localhost:3103/workspace`, not Alex preview or a customer account. Screenshots are captured by root using the in-app browser. Independent agents did not interact with this browser unless separately documented. A final commit/build reference will be added after integration.

## Observed flows

- Normal local phone-link activation opened QA Riley's empty account. The local HTTP fixture separately passed ten acceptance groups. Its consumed sign-in token/cookies are not published.
- Saved the illustrated Lemon chicken grain bowl recipe, planned four portions, and saw source-linked groceries. Added one manual Wholegrain bread entry. Changed the meal to two portions through a grocery source link: compatible ingredient amounts halved and the manual entry stayed intact.
- Checked rice as purchased; Pantry remained empty. Explicitly recorded 100 g cooked brown rice in Pantry. The matching source-linked grocery then showed 200 g required. Purchased is a current checkbox, not a purchase-history ledger; changing stock recalculates that row.
- Meal planning did not add consumed food. Manually logged QA dinner portion on October 22: 350 g, 510 kcal, 32 g protein, 55 g carbs, 16 g fat, unknown fiber. Copied half to October 23: 175 g, 255 kcal, 16/27.5/8 g macros and fiber still unknown. The older date stayed unchanged. Checked the diary at 390×844 and desktop.
- Feedback initially showed raw `Failed to fetch`. The recovery implementation replaced it with draft-preserving guidance, but the actual browser exposed an unbound native-fetch receiver error that mocked transports missed. An arrow wrapper repaired it, with a failing-before/passing-after regression.
- On the repaired code, opened a fresh synthetic report, stopped only the isolated local PostgreSQL cluster briefly, and clicked Send. The form retained its exact draft with actionable recovery text. After restoring the same loopback cluster, retried without editing or remounting: the UI returned a saved receipt. Copy succeeded; Tab from Done wrapped to Close feedback; Escape returned focus to Report a problem. Read-only database verification found exactly one matching encrypted report with follow-up consent false.
- Created QA morning start with Drink water and Pack bag, checked Drink water, moved Pack bag before it, saved and reloaded. Progress remained 1/2 and followed the step identity, not its position. Started Pack bag's two-minute focus, paused at 1:33, reloaded and observed the same paused time. Resumed and explicitly completed it; the routine showed 2/2.
- Created QA prepare a portfolio with its purpose and a five-minute step, Choose two project photos. Completed that linked step through To-do, then explicitly marked the goal achieved. Reloaded achievement and linked-task state agree. Step completion currently takes a trip to To-do; this is usability friction, not a failed save.
- Seeded one clearly synthetic preference through the local fixture helper, then removed it through the UI and reloaded. The memory stayed deleted and prior conversation rows remained unchanged. This tests deletion, not live AI extraction/correction.
- Customized Walk & unwind as QA campus walk: 15-minute Walk & mobility with a shorter seven-minute middle movement. Saved and scheduled it for October 23 at 5 PM New York time. Separately logged a completed 12-minute session on October 22 with a synthetic note. Reload retained the saved plan/log; the future scheduled task stayed not_started with its original 15-minute duration. Logging did not silently complete it.

## Records and captures

`../verify-browser-food.ts` performs read-only checks scoped to the exact synthetic account in the ignored local fixture. Ten record groups passed: synthetic identity, recipe/meal portions, manual grocery, source-linked grocery/pantry math, two diary dates and unknown nutrient, no scheduled provider jobs, one encrypted feedback record matching the displayed recovery receipt, routine order/completion and removed finished focus, achieved goal/linked task, and distinct fitness plan/log/future task. It uses the launcher's known synthetic encryption key, never a populated environment file. `browser-memory-fixture.ts verify` separately checked deletion and unchanged prior history. Its local baseline is not published.

| Capture | Meaning |
| --- | --- |
| 01-authenticated-home.png | Actual signed-in synthetic workspace |
| 02-groceries-and-pantry.png | Explicit pantry stock and linked shopping |
| 03-nutrition-half-portion.png | Next-date half-portion diary |
| 04-nutrition-phone.png | Diary at phone viewport |
| 05-feedback-offline.png | Pre-fix raw error, retained for provenance |
| 06-feedback-recovery-message.png | Final repaired transport, real local DB failure, retained draft |
| 07-feedback-retry-receipt.png | Successful retry after that failure; copied receipt |
| 08-routine-reordered-reloaded.png | Reordered routine, preserved completion after reload |
| 09-routine-focus-completion.png | Explicit timer completion reflected in routine |
| 10-goal-achieved.png | Explicit achieved goal after linked step completion |
| 11-memory-removed-reloaded.png | Removed synthetic preference remains absent |
| 12-fitness-saved-and-logged.png | Custom plan and independently logged actual duration |

The earlier image named 07 was rejected because it still showed an error, then replaced with the actual successful final receipt. Names alone are not evidence.

## Limits and anomalies

- No live model, SMS carrier, Google Calendar, catalog, barcode/camera or physical device was exercised. Calendar remained disconnected; proactive check-ins stayed off. No paid API calls or production changes occurred.
- A desktop viewport emulation is not a physical phone or assistive-technology review. Clipboard denial and screen-reader behavior remain untested. Copy success and keyboard focus checks are distinct evidence.
- Recovery covers a mounted draft, not an offline queue or recovery after reload. Development hot refresh/remount discarded an unsaved test draft once; this is not presented as successful draft persistence across reload.
- One earlier local restart mistakenly omitted the explicit port option and started the synthetic cluster on its default port. It was stopped and restored to 127.0.0.1:55437, with record checks passing. The final outage/retry used the correct explicit options and automatic restart. Production was unaffected.
- An early meal editor action was inert in an old development client and worked after reload; no stable reproducer or root cause was established. Later account-ownership edits also triggered expected development remounts; affected unsaved forms were reopened before further acceptance.
- Routine local-day reset is covered by the separate scripted first-week fixtures; this browser session did not wait overnight. Browser screenshots do not replace that durable-state evidence or prove provider delivery.
- No whole-product rating or release approval is assigned by this root report. Independent review must state its own observation limits.
