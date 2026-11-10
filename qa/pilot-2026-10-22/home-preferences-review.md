# Independent Home preference review

2026-10-22, adaptive worktree. Reviewer: C1/ledger agent, independent of implementation author `workflow_backend`. No author code was edited. No actionable implementation finding in the requested production scope: `home-model.ts`, `TodayView.tsx` and the `WorkspaceClient.tsx` Home save callback.

## Behavior inspected

Custom dinner timing now chooses the Dinner meal slot during its configured window, ahead of the default Breakfast/Lunch slot selection. The modular local-clock calculation covers 45 minutes before through 105 minutes after dinner, with the end excluded. Account-local day selection remains authoritative for the meal date. Early 14:00 dinner and a 00:30 dinner window are tested: before local midnight, a meal saved for tomorrow is not displayed; after local midnight, the matching current-date dinner is displayed. Previous-day/future-day meals are excluded. Existing focus/calendar/workout/routine priority and explicit banner overrides remain unchanged.

Opening settings captures normalized preferences S0 in component state. Form defaults and `expected` use that captured object, while a same-owner background snapshot can update the page's current S1. `WorkspaceClient` forwards the captured expected value without substituting its newer data. A failed save leaves the form mounted and displays a close/reopen instruction; reopening initializes from current saved preferences. These uncontrolled inputs retain their DOM draft while the same form stays mounted. The hook-level regression verifies snapshot retention, failed-form retention and reopening, but is not a real browser DOM/keyboard test.

Pinning is a separate immediate action against the current rendered saved preferences, not an open settings draft. Explicit pins and temporary previews override automatic mode; a successful pin/unpin clears temporary manual selection. Task/calendar content continues to come from current data. Existing model tests cover explicit pin/temporary choice even during saved focus; the new pin callback regression verifies its current preference baseline.

## Actual compare-and-save path and ownership

The authenticated workspace API validates the immutable account cache key before calling `mutateWorkspace`. The real repository schema validates expected/new preference shapes. Its transaction first locks the owned account row, compares normalized stored Home preferences with `expected` using deep equality, and rejects a mismatch before updating. The update merges the Home field into existing workspace preferences. Existing PGlite integration executes this actual repository path: it saves one set, rejects the old baseline, preserves unrelated preferences/consent and leaves another account unchanged. The author also added the explicitly requested S0→other-tab S1→stale S0 draft case: the save rejects, and both a fresh workspace read and direct database read still contain S1. I independently reran that final integration file successfully. This is database-backed CAS coverage, not merely a mocked React callback.

The page mounts the whole stateful workspace under the immutable account cache key. Same-owner polls and temporary failures retain the draft, while account invalidation/switch unmounts it. Mutation responses are checked for mounted state and matching owner before reconciliation; the server also checks the account header. Ownership tests exercise same-owner continuity, remounting, malformed unauthorized responses and rejection of another owner's snapshot. The scoped Home changes introduce no new identity or request path.

## Independent tests and limits

```powershell
npx vitest run src/app/workspace/home-model.test.ts src/app/workspace/home-preferences-form.test.ts src/server/db/repositories/adaptive-home.integration.test.ts
npx vitest run src/app/workspace/workspace-ownership.test.ts src/app/api/account/workspace/route.test.ts src/app/workspace/workspace-mutation-attempts.test.ts
```

Observed results: initially three files/15 tests passed, then three files/38 tests passed. After the author added the explicit S0/S1 case, `npx vitest run src/server/db/repositories/adaptive-home.integration.test.ts` passed all five tests, including the new case. This covers six files and 54 distinct passing tests in the final scoped source. I also read the author's `home-preferences-followthrough.md`; its component-test and deployment limits are accurately stated. No real browser preference interaction, actual concurrent PostgreSQL sessions, provider call, populated environment file, production change or commit was performed in this review. Root owns browser dinner/form verification and integrated release checks.
