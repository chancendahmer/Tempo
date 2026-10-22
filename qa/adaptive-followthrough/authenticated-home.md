# Authenticated adaptive Home HTTP verification — 2026-10-21

Ran `npx tsx qa/adaptive-followthrough/authenticated-home.ts` against **exactly `http://localhost:3103`**, using the synthetic local PostgreSQL database **`127.0.0.1:55437/tempo_ui_release`** and the public QA encryption/signing key `Buffer.alloc(32, 7)`. The script refuses a different base argument and asserts the database name before creating records. It reads no populated environment file and invokes no external provider.

Result: **exit 0, 10 acceptance groups passed**. Machine-readable results are in [authenticated-home-results.json](authenticated-home-results.json).

| Check | Observed result |
| --- | --- |
| Normal authentication | Both fresh synthetic accounts were denied before activation. Action-link GET displayed the dashboard button without activating the session. Normal POST activation returned 303 and an HttpOnly/SameSite cookie; action-link replay returned 400. |
| Empty account | QA Riley began with default Home preferences and no sample tasks, goals, life items, reminders, messages, calendar connection or busy records. |
| Preference persistence | Saved auto mode, 07:30 morning, 18:30 dinner, 21:00 evening and 30-minute workout lead. Fresh HTTP and independent SQL reads matched. |
| Preference conflicts | Repeating the stale expected-state request returned 409. Two simultaneous edits against the same expected state returned exactly one 200 and one 409. A subsequent edit using the latest state succeeded. Preferences use compare-and-swap semantics, so repeating the original expected state is a conflict rather than an idempotent acknowledgment. |
| Task replay/concurrency | Three concurrent identical create requests persisted one task. |
| Manual icon/timer | The personal category and seven-minute timer persisted with manual provenance. Repeat was accepted; stale-title, zero-minute and foreign-account mutations were rejected. |
| Start task and focus | Three simultaneous identical Start requests produced one running task and one durable seven-minute focus with the correct task link, remaining seconds and deadline. Fresh HTTP and independent SQL reads agreed. |
| Start conflicts | Changing the timer under the same request ID, starting a second task while focused, editing the presentation after starting, and foreign-account focus mutation all returned 409. Stored focus remained unchanged. |
| Origin and account isolation | Foreign-origin writes returned 403. Foreign task/presentation/focus mutations returned 409, and the separate account retained its empty records/messages and disabled proactive preference. |
| Provider work | No scheduled actions existed for QA Riley after the checks. No model, SMS, Calendar, paid API or worker operation was invoked. |

The preserved QA Riley fixture has a running focus on “Write a short project outline,” a manual personal category/seven-minute timer, one unstarted “Pack a bag for tomorrow” task, and the saved Home preferences above. A separate isolation account is preserved. Each script run creates fresh synthetic accounts; it does not modify previous fixtures or clean up unrelated records.

An unused browser sign-in URL was saved in **ignored** `qa/adaptive-followthrough/local-sign-in.json`, with a 15-minute expiry. The token/cookie was not printed or included in the shareable results. The parent task owns browser activation and rendered UI evidence. These results establish authenticated local HTTP/PostgreSQL behavior, not production deployment or browser behavior.
