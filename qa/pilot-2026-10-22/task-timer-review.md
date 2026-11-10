# Independent task timer review — 2026-10-22

Result: **no actionable finding in the reviewed timer fix**. The reviewer originally reproduced the persisted stale-timer defect and independently reviewed W2's correction. W2 authored the task domain/repository changes and their new tests; this review does not modify them. The reviewer's separate Home preference patch is independently reviewed by C1.

## Source and invariants checked

- `task-repository.ts`: a changed title or total estimate clears automatic/fallback metadata atomically in the task update. SQL compares estimates with `IS NOT DISTINCT FROM`, so null is handled as a value. Unchanged inputs and due-only changes retain metadata. A valid manual presentation remains the user's explicit starter choice, including across a renamed task or a smaller total estimate.
- `task-presentation-repository.ts`: the optimistic enrichment write requires the original owner, task ID, title, total estimate, not-started state and null presentation. A duration correction during either a successful mocked model call or an unavailable-model fallback prevents the obsolete write. If the write wins first, a subsequent task correction clears it. A fresh enrichment then reads and clamps against the corrected estimate. An intervening manual override also blocks enrichment.
- `task-presentation.ts`: an already stored nonmanual timer exceeding a known total estimate falls back to a correctly bounded deterministic starter and does not retain AI provenance. Valid manual choices keep priority. Matching automatic metadata remains usable when its duration fits the estimate or the estimate is unknown.

No schema, authorization, provider-boundary or UI contract change was required for this fix. Existing owner/status predicates remain in the inspected writes. Starting a session with the duration explicitly shown on an already-rendered button remains the established behavior; this review does not redefine manual starters as total completion estimates.

## Fresh independent execution

```text
npm run test -- src/server/domain/task-presentation.test.ts src/server/db/repositories/task-presentation-repository.integration.test.ts src/server/db/repositories/adaptive-home.integration.test.ts src/app/workspace/home-model.test.ts src/server/adapters/llm/task-presentation.test.ts
```

Result: **5 files / 34 tests passed**, exit 0. This includes the separate Home regressions added during the same work period. The integration tests use real in-process PGlite with the migration chain; provider suggestion callbacks are mocked. Cases cover normal workspace 30→2 corrections for AI/fallback, estimate increases/decreases and null transitions during enrichment, successful re-enrichment from the new estimate, unavailable-model races, unchanged values, manual preferences and manual overrides during enrichment.

A separate read-only-source, in-memory PGlite exercise independently checked five additional groups through normal `mutateWorkspace` updates: null→null retention, identical title/estimate retention, due-only retention, automatic 30→2 invalidation with a two-minute fallback, and manual rename/30→2 retention with a fresh read still showing the explicit 20-minute manual starter. All five groups passed. No local persistent fixture was changed.

Limits: this is source and isolated database/unit verification, not observed browser behavior, a live model response, a deployed worker run or a provider billing check. No paid calls, secret-file reads, external services, production access or commits were performed. Root owns the final integrated release checks.
