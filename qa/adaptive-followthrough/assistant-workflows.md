# Assistant workflow verification — 2026-10-21

This pass exercised existing assistant and safety paths on the local candidate. It did not change assistant behavior code, use a real model, contact a carrier, send an external message, or use a paid API. SDK-dependent tests mock the model/authorization responses; integrations use temporary PGlite databases and synthetic accounts.

## Scripted simulation

Ran the normal repository script: `npm run simulate:assistant -- --scripted`.

Result: **exit 0, 33 scenarios, 0 detected issues**, followed by duplicate-webhook, malformed-media, and second-user checks. The script saved the local ignored artifacts `qa/assistant-scripted-latest.json` and `qa/assistant-scripted-latest.md`; the transcript was inspected. Fixture-generated replies explicitly say `[SCRIPTED MODEL FIXTURE]`, and some lookup scenarios expose raw captured tool results by design. These are deterministic code-path transcripts and do not establish live AI answer quality.

Observed scenario paths include everyday preference save/recall/selective forgetting, relative and dated reminder creation, move/complete/cancel, task/goal create/list/complete, calendar proposal/NO, secret refusal, explicit proactive check-in enable/disable, duplicate suppression, and account isolation. Calendar behavior uses a fixture adapter; proactive delivery is explicitly disabled in this simulation.

## Focused regression suite

Ran:

```powershell
npm run test -- src/server/domain/meal-groceries.test.ts src/server/db/repositories/meal-groceries.integration.test.ts src/server/adapters/llm/task-intent-parser.test.ts src/server/adapters/llm/turn-authorizer.test.ts src/server/domain/turn-write-policy.test.ts src/server/domain/memory-service.test.ts src/server/domain/consent.test.ts src/server/domain/context-engine.test.ts src/server/jobs/handlers/proactive-followup.test.ts src/server/testing/assistant-simulation.integration.test.ts src/server/testing/reminder-week-feedback.integration.test.ts src/server/testing/reminder-week-safety.integration.test.ts src/server/testing/reminder-followup.integration.test.ts src/server/testing/reminder-batch-cancellation.integration.test.ts src/server/testing/capture-reminder.integration.test.ts src/server/testing/account-journey.integration.test.ts src/server/testing/indirect-week-journey.test.ts
```

Result: **17 files, 258 tests passed**. Expected failure-path logging included mocked billing/configuration/transient provider responses and unavailable or malformed write authorization. These logs were assertions of graceful failure, not failing tests or real provider errors.

| Checklist behavior | Fresh test evidence |
| --- | --- |
| Short clarification answers | `task-intent-parser` checks linked time-only answers, short questions, routine/task clarifications through unsolicited outputs, wrong links, human topic changes, and DST corrections. `reminder-week-feedback` preserves the delivered reminder subject through a second time clarification. |
| Multiple reminders | Feedback/safety tests create two requested times, suppress replay, move exact current IDs, preserve dates, cancel old jobs, reject fabricated times/wrong days/negation/advice, and roll back unowned or stale batches. Batch cancellation tests exercise lookup/authorization, expected-time conflicts, account scope and idempotent receipts. |
| Capture plus reminder | `capture-reminder` exercises note/task/goal captures with their reminders, replay, reminder-failure rollback, and rejection when only one half of the compound write is authorized. |
| Advice-only requests | Parser/write-policy tests reject fabricated writes from advice or explicit no-change wording, including deletion after a valid lookup; uncertain/unavailable/malformed authorization fails closed. Indirect journey acceptance checks detect unsolicited changes. |
| Deletion and selective forgetting | Parser tests require a fresh matching memory lookup before ID-based deletion. Simulation selectively removes yogurt while retaining blueberries. Account journey tests exercise SMS creation, web edits, SMS recall/delete, and refusal of foreign edits. |
| Proactive consent and gates | Explicit opt-in/out wording is distinguished from questions, negation, conditional requests and contradictory requests. Context tests preserve separate opt-in, quiet hours, calendar busy/unknown, daily cap, cooldown, recent conversation and pending response gates. Queued follow-up handler tests withhold delivery after removal and preserve consent checks. |
| Food quantity display | Ingredient tests cover common fractions, explicit approximation, tiny positive quantities, unknown amounts, and immutable source values. Transactional compact-unit/serving/pantry tests remain green. |

Separately ran `npm run test -- src/app/workspace/FoodViews.test.ts`: **2 tests passed**. `npm run lint` and `npm run typecheck` passed after the label change.

## Remaining evidence

The above covers deterministic behavior and mocked parser boundaries. It does not measure live-model interpretation of unanticipated phrasing, quality of coaching responses, live web search, actual SMS delivery, production workers, real Calendar writes, or production concurrent database behavior. No paid live-model evaluation was attempted in this pass. The parent task owns browser/HTTP workflow evidence and the final combined repository check.
