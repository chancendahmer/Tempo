# Real local HTTP/PostgreSQL ownership exercise

Executed independently by `w2_reminder_clarity` on 2026-10-22 against the running candidate at `http://localhost:3103` and the exact local database `127.0.0.1:55437/tempo_ui_release`. Executable artifact: [account-owner-http.ts](account-owner-http.ts); latest observed outcomes: [account-owner-http.json](account-owner-http.json).

```powershell
node --import tsx qa/pilot-2026-10-22/account-owner-http.ts
```

The final run passed **19 checks**, exit 0, after session-bound logout was added to the candidate. Two earlier 18-check runs also passed; the second added explicit successful-write owner-echo assertions for workspace, setup and profile. The latest run observes `/api/account/me`'s top-level `sessionKey`, verifies stale/missing logout proofs cannot revoke the current cookie, then uses the observed B proof for the intentional logout. Each run created two different synthetic accounts and verified their removal afterward. The JSON is the latest run, not a sum of runs.

| Real HTTP case | Observed outcome | Durable verification |
| --- | --- | --- |
| Fresh A and B sessions, before activation | Workspace 401; sign-in GET 200 without activation; sign-in POST 303; repeated token POST 400 | Session `activatedAt` remained null after preview; normal activation issued independent authenticated cookies |
| Stale A owner with B cookie, workspace/setup/feedback/profile | All four 409 | Exact A/B user/item/receipt/feedback/write-limiter snapshots unchanged |
| Missing owner, all four routes with B cookie | All four 409 | Same unchanged-record and unchanged-limiter assertion; workspace/setup/feedback return `account_changed` |
| Current B workspace save, then same payload retry | Both 200; response owner matches B; identical receipt text | Exactly one saved item and one action receipt |
| Valid B header attempts edit of A's saved item | 409 | A's complete checked durable snapshot unchanged |
| B setup save and identical repeat | Both 200; response/read owner matches B | Intended name, tone and streak settings persist; repeat has the same intended values |
| B profile save and identical repeat | Both 200; response/read owner matches B | B's name and instructions persist; A stays unchanged |
| B feedback and identical request-ID retry | Both 201; identical receipt and B owner | One feedback row with matching request/receipt IDs, expected encrypted detail decrypts, feedback write limiter count exactly one |
| Current B workspace retrieval | 200 | Contains B's marker and excludes A's; A checked records still unchanged |
| Missing or stale A logout proof with current B cookie | Both 409, `session_changed`, no Set-Cookie | B session `revokedAt` values unchanged; authenticated B account remains available |
| B session revoked through actual logout route using observed B session proof, then four writes | Logout 200; all writes 401 | Rejected session cannot update any of these routes |

The script follows the existing synthetic activation helper contract: fresh run-owned users, an initially inactive `WebSessionService` session, and the normal local sign-in preview/redemption endpoints using the public synthetic fixture key. It never contacts a carrier to obtain a sign-in link. Account IDs/cookies/tokens/private draft contents are not written to JSON; evidence contains only a run identifier, fixed local coordinates and check summaries. It clears inherited PG settings before creating its explicit local pool and disables password-file fallback. HTTP paths are allowlisted; no chat, provider or paid endpoint is used. It accepts no alternate target arguments.

Cleanup is restricted to IDs created by that run and verifies each remembered synthetic phone matches before deleting. Only the exact three account-specific write-limiter keys are removed separately; account deletion uses both owned ID and matching phone. User absence is asserted. Neither `qa/adaptive-followthrough/local-sign-in.json` nor any personal account, populated environment file, schema/migration, UI or production source was read/changed. No server or cluster restart occurred.

Raw `npm run typecheck` passed. The initial ordinary file ESLint invocation was ignored by the repository's QA exclusion; `npx eslint --no-ignore qa/pilot-2026-10-22/account-owner-http.ts` then ran and passed. Final rerun was followed by file validation again. Root owns commits and the integrated full check.

This is actual HTTP handler and durable PostgreSQL evidence, independent of the earlier mocked route suites. It emulates an account switch by sending B's real cookie with A's stale owner key; it does not observe browser tab synchronization, React remounts, rendering, clipboard, live AI interpretation, carrier delivery, or production behavior. Setup/profile repeat checks establish repeat-safe intended values, not new idempotency receipts for those routes. No defects were observed in the exercised server ownership contract.
