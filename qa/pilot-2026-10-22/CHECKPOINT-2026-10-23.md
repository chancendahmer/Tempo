# October 23 checkpoint — resume here

The founder asked to wrap up in roughly fifteen minutes. This checkpoint saves the tested candidate, not a production release. Worktree: `tempo-adaptive-home`; branch: `codex/tempo-adaptive-home`; base before this package: `49c3088`. The commit containing this record is the current package. Preserve the unrelated original OneDrive checkout.

Product checkpoint **177ece3** was pushed and its remote SHA verified. **Draft PR27**: https://github.com/chancendahmer/Tempo/pull/27 . The following documentation-only checkpoint records the PR and final local screenshot. The PR is explicitly gated; no merge or deployment happened.

## Completed and verified

- Session-bound logout/reset, owner-bound Calendar reads, sanitized OAuth failures and usable expired/unavailable phone-link recovery.
- Real local account flows: wrong-number reset, abandoned-link rejection, optional onboarding, empty-account isolation, populated-account return, outage/retry with retained profile draft, saved preferences and distinct profile navigation targets.
- Adaptive Home custom dinner window and stale preference-dialog protection; automatic starter timers follow corrected task estimates while manual choices survive.
- Delivery report now calls out failed/undelivered rows in its selected window without automatically replaying them.
- First-use Journey/setup wording and signup consent readability corrected after independent review. Root observed task timer pause/reload/resume/completion and earned Journey progress.
- Final raw `npm run check` exit0: **1,232 passing, 3 skipped; 166 passing files, 2 skipped; lint/typecheck and both production/operations builds passed**. Generated Next paths restored. No migration added in this package.
- Independent code/package reviews found no critical/high defect in their stated scope. Final screenshot-only ratings: signup8.3, Journey/setup8.4 from UI reviewer;8 for each revised first-use state from customer reviewer. These are not whole-product functional scores.

## Production findings — do not clear by replay

Railway is signed in. Both service cards show the previous production release active. The selected worker console reports main `86ae01023abcf24bcc8da9ed9d367192e14a29ae`. Public readiness is503, database/worker ready, queue problem `outbound_reconciliation_required`. At17:33:36UTC a bounded read-only aggregate found35 ambiguous rows, all older than7days, zero stale-submitting rows and zero stored provider receipt references. Oldest creation hour August20 01:00UTC; latest update hour September30 15:00UTC. No message bodies, phones or individual IDs were queried. No production writes, provider calls, resends, migration or deployment occurred.

Read `release-access-preflight.md` and `outbound-reconciliation-operator-notes.md` before further diagnosis. The prepared broader grouping SQL has not been executed. Do not mark messages accepted/failed merely to make readiness green.

## Next work, in order

1. Reconcile the old ambiguous obligations using actual provider evidence or a reviewed explicit unresolved disposition. Preserve no-duplicate-send guarantees. Complete web/worker deployment/configuration inventory; one console metadata result is not full deployment proof.
2. Reconcile historical paid-call accounting before more live calls. This continuation spent **$0**; no remaining allowance is proven against the original aggregate$10 cap. Do not read populated environment files.
3. Finish candidate real-model/demo SMS/Google Calendar checks with appropriate infrastructure. No paid staging was authorized. Keep fixture simulations, local HTTP/PG, rendered UI and actual carrier deliveries distinct.
4. Finish hosted backup/restore, alert routing, cost-policy/cap rollout evidence and fresh independent end-to-end/accessibility review. Follow `docs/PILOT_PLAN.md` gates for10→25→100 people. Do not average away a failing section.
5. Only then merge/release, verify compatible web/worker versions and real demo reminder delivery, or document an exact external blocker. Current production stays unchanged.

## Local runtime and evidence

The normal isolated launcher is running at`http://localhost:3103`; signup stub is stopped, workers/providers disabled. Latest restart launcherPID2368, child7288 (verify before acting). Local PG17 is127.0.0.1:55437/tempo_ui_release. The safe launcher is`node qa/adaptive-home/start.cjs`; it refuses populated env files. The browser has populated fictional QA Riley, and QA Morgan's new-account first task is intentionally completed. Use normal fixture links only for these named isolated accounts. Never commit ignored bearer files.

Raw final check log:`qa/pilot-2026-10-22/checkpoint-final-check.log`(ignored). Durable verification:`verify-browser-food.ts`/`fresh-browser/records.json` and`account-owner-http.md/json`. Visual evidence:`fresh-browser/README.md`, independent-ui-review.md and`customer-current/review-followthrough.md`. API accounting:`live-budget-reconciliation.md`, `docs/PILOT_AI_ACCOUNTING.md`. Readiness and unresolved integration gates remain explicit in`docs/PILOT_HANDOFF.md`.
