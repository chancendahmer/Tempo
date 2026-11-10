# Home preference follow-through — 2026-10-22

Scope: the adaptive worktree's existing Home design, persisted preferences, task presentation semantics, owner changes and account-local day boundaries. No provider calls, populated secret files, external accounts, browser actions, production changes or commits were used. Root owns current browser verification and independent review.

## Confirmed defects and bounded changes

1. **Custom dinner time did not select the corresponding meal slot.** A fresh pure-model reproduction with a saved Dinner dated October 22 and `dinnerTime: "14:00"`, evaluated at 14:00 in America/New_York, returned the Focus banner and an empty “Lunch plan” choice. The code selected Breakfast/Lunch/Dinner by fixed hours before applying the configured dinner window. `home-model.ts` now selects Dinner inside that configured window. Existing focus, ongoing-calendar, movement and routine precedence stays in place. The current account-local day still determines the saved meal date; a tomorrow meal is not borrowed before local midnight, and yesterday's meal disappears after the day changes.

2. **A background poll could bypass the preferences conflict check.** The open dialog kept its original uncontrolled field values, while its save callback took `expected` from the most recently polled workspace. Opening at S0, polling another tab's S1, and then submitting the S0 draft therefore supplied S1 as the expected state and could overwrite the other tab. `TodayView.tsx` now captures the opened preferences as its dialog state, uses them for defaults and the expected baseline, and passes that baseline through the existing `WorkspaceClient.tsx` save callback. The existing database compare-and-swap rejects a stale baseline. Failed saves retain the draft and explain how to close/reopen to review current settings. Immediate pin/unpin uses current preferences. Account-owner changes continue to remount the entire workspace, discarding the previous owner's dialog.

The only `WorkspaceClient.tsx` changes in this package are the `TodayView` `saveHome` callback and removal of its now-unused `readHomePreferences` import. The existing owner/session recovery, request guard, save/retry handling and server contract remain intact. There are no layout, asset or stylesheet changes.

## Task-duration finding handed to another owner

A fresh isolated PGlite database using the migration chain reproduced a separate persisted-state defect: create “Read report” with total estimate 30, mock-enrich an AI starter of 20, update only the total estimate to 2 through `mutateWorkspace`, then read the task again. Its stored AI presentation and `taskPresentation` still reported 20. The repository invalidated suggestions only on title changes; enrichment also lacked an estimate-snapshot write guard. This is distinct from an explicit manual starter, which intentionally takes priority over the total estimate. Root assigned the bounded timer fix to W2; this package does not modify the task domain/repository or claim that finding resolved.

## Fresh validation

Before changes, the selected Home/model/persistence/adapter/ownership suites passed **5 files / 37 tests**, despite the custom-dinner reproduction above. After changes, the normal repository command passed **7 files / 44 tests**:

```text
npm run test -- src/app/workspace/home-model.test.ts src/app/workspace/home-preferences-form.test.ts src/app/workspace/today-model.test.ts src/app/workspace/today-calendar.test.ts src/app/workspace/calendar-connection-view.test.ts src/app/workspace/workspace-ownership.test.ts src/server/db/repositories/adaptive-home.integration.test.ts
```

New regressions exercise a saved 14:00 dinner, a 00:30 dinner across the New York local-day boundary, rejection of tomorrow/yesterday meal borrowing, the real customization form handler after a same-owner preference poll, retention of a rejected draft, reopening against current preferences, and immediate pinning against current state. A dedicated PGlite case also applies S0 → another tab’s S1 → stale S0 draft through normal `mutateWorkspace`, then confirms both a fresh workspace read and direct database read still contain S1. Existing tests freshly rechecked timezone/DST behavior, focus/calendar priority, same-owner draft preservation, account-switch remounting, malformed auth responses, database preference isolation/conflicts and manual timer persistence.

`npm run lint` and `npm run typecheck` both passed with exit 0. `git diff --check` passed for the scoped product/test files. The component regression uses isolated React hooks and invokes the real rendered handler; it is not a physical browser observation. The saved-state tests use an in-process database and synthetic accounts, not a deployed worker or provider. Root owns broad integrated validation and independent review.
