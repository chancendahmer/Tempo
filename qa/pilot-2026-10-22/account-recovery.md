# Profile, board and connection recovery — 2026-10-22

Author: `workflow_backend`. Follow-through from the independently reviewed route-log privacy patch. Root authorized the three client fixes and the narrow account-ownership prerequisite. The existing design/classes were retained. No live outage, browser session, real account, provider call, deployment, migration or commit was used in this pass.

## Customer behavior

- Profile distinguishes an initial account-service failure from an unverified account: it displays a recoverable unavailable state and Try again, rather than “Finish the text setup.” A previously loaded profile and its draft remain visible during a temporary polling failure, explicitly labeled last known/out of date. Saving and logout controls are disabled until account status recovers.
- Board retains a previously verified same-account board during a temporary refresh failure and labels it last known/out of date, with manual retry and continued polling. Initial failure displays an unavailable state. Auth loss clears the projection and shows login. Stale spoken briefings are disabled and active speech is cancelled.
- Extensions retains the last known same-account connection projection with a stale label and retry. A failed initial details lookup is labeled unavailable, not disconnected. Stale connect/disconnect links are withheld until recovery. Auth-specific failures retain login handling.

## Account ownership prerequisite

The earlier public account projection exposed only editable profile fields and a phone suffix; those cannot safely identify ownership. Verified account responses now include a stable SHA-256 cache discriminator derived from the server-owned account UUID and a versioned namespace. It grants no authority, is not used to select an account, and adds no database state or secret dependency. Pending/unverified account responses retain their earlier minimal shape and do not include this key.

Board and Extensions responses include the same server-derived discriminator. The shared projection hook accepts a payload only when its server key matches the currently verified account key; a response fetched after a cookie/account switch cannot be labeled as belonging to the previous account. Cache matching is never a substitute for the routes' existing verified session checks.

Profile, Board and Extensions mount their private inner views under that stable ownership key. Changing the owner or losing verified auth removes the prior view/draft. Ordinary same-owner polling does not reset drafts. The shared account hook immediately invalidates cached account state and aborts a pending lookup on an explicit `ACCOUNT_EVENT`; the subsequent lookup must establish ownership again. Aborted/superseded resource requests and late JSON bodies cannot repopulate a removed view.

### Independent review follow-up: profile write ownership

The independent reviewer identified the related cross-tab write race: a profile form rendered for account A could be submitted after the cookie switched to account B, before the next poll. Root approved a required optimistic ownership precondition for profile writes. The client now submits its rendered `expectedCacheKey`; profile PUT first authenticates the current session, then compares that key with the server-derived discriminator before updating anything. Missing or different keys return a private 409 instructing profile refresh, with zero profile mutation. The key remains a cache/concurrency discriminator and cannot authenticate or select an account.

The client handles that 409 by unmounting the stale editor, dispatching `ACCOUNT_EVENT`, and displaying a reload/review-account gate. It does not leave an account A draft ready to retry against account B. Legacy clients without the precondition fail safely with 409.

## Changed paths

- Clients: `src/app/profile/ProfileClient.tsx`, `src/app/board/BoardClient.tsx`, `src/app/extensions/ExtensionsClient.tsx`.
- Shared client state: `src/app/components/account-state.ts`, new `account-resource.ts`, their tests, and new `account-recovery-views.test.ts`.
- Approved identity prerequisite: `src/server/security/web-session.ts`, new `public-account.test.ts`, `src/app/api/account/board/route.ts`, `src/app/api/account/extensions/route.ts`, and the response-key assertions/mock in `authenticated-route-errors.test.ts`.
- Approved profile-write follow-up: `src/app/api/account/me/route.ts`, client payload/reset handling in `ProfileClient.tsx`, new `src/app/profile/profile-owner-submit.test.ts`, and missing/stale/current-owner route assertions in `authenticated-route-errors.test.ts`.

## Fresh validation

Read the bundled Next client-component guide before editing UI behavior.

```powershell
npm run test -- src/app/profile/profile-owner-submit.test.ts src/app/components/account-recovery-views.test.ts src/app/components/account-resource.test.ts src/app/components/account-state.test.ts src/server/security/public-account.test.ts src/server/security/authenticated-route-errors.test.ts src/server/security/web-session.integration.test.ts src/app/extensions/calendar-status.test.ts src/server/security/phone-signin-route.test.ts src/app/api/account/setup/route.test.ts src/app/api/account/feedback/route.test.ts
```

**11 files / 54 tests passed**, exit 0 after the profile-write follow-up. Coverage includes initial outage presentation, stale profile/board/connection labels, disabled stale actions/audio, auth-specific gates, stable versus changed editor keys, late-response cancellation, owner-mismatched payload rejection, immediate account-event invalidation, stable opaque verified-only public keys, server-session-bound Board/Extensions response keys, profile payload ownership/reset on 409, missing/stale owner rejection before mutation, and the earlier route/session/privacy checks.

Raw `npm run lint` and `npm run typecheck` passed after the product edits. `git diff --check` passed on the owned tracked changes. Root owns independent review, rendered browser interaction and the final combined repository check.

## Limits

UI evidence here uses static rendering with controlled account/resource states, a form-submit harness and focused hook cancellation tests. It does not establish actual browser transitions, layout, audio hardware behavior, live outages, or instant detection of a cookie change made in another tab before the next account lookup. Server response ownership checks prevent a new account's fetched projection from being attributed to an old cached owner; explicit account events invalidate immediately. The independent reviewer/root separately coordinate equivalent ownership guards for core workspace/setup/feedback; those are outside this author's edits and are not certified by this report. No changes were made to authorization rules or the separate conversation/reminder/model flows.
