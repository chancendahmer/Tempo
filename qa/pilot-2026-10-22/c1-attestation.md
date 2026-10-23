# C1 runtime configuration attestation

Implemented on the adaptive worktree only. No deployment, production configuration, operating allowance, schema migration, provider request or spending was performed.

The existing `service_heartbeats` table now records a sanitized AI configuration snapshot alongside every worker instance heartbeat. Next.js Node instrumentation registers a separate web instance heartbeat every 30 seconds. A process-global singleton prevents duplicate registration during HMR; writes serialize, timers do not keep the server alive, and startup/import/database failures are contained with fixed messages. Sign-in and STOP do not depend on heartbeat success. Shutdown stops new pulses and joins pending writes. Web rows remain because this hook cannot prove that Next.js has drained every request; a stale row requires verified inventory/retirement review. Existing worker retirement still requires its existing drained-handler proof.

Snapshots contain the exact enforced/off/invalid mode, validated official provider host classification, current price version/expiry, four integer cap strings, recomputed policy hash, and all five operation-to-pinned-model choices. They are generated through the same `buildAdmissionEnvelope` validator used by paid calls, with an explicit configuration and no network request. Unsupported raw model names, URLs, API keys, account/instance IDs and arbitrary metadata are never returned by the aggregate. A source regression confirms that all five current adapters use the same `ANTHROPIC_MODEL` source represented in the snapshot. A changed per-adapter model source requires an updated footprint and review.

The read-only operations snapshot aggregates every observed web/worker instance, with bounded inventory and a 120-second freshness window. Missing roles, missing/malformed snapshots, off/invalid modes, unsupported provider overrides, conflicting cap/model/version footprints, mismatched builds, stale/future timestamps, inventory overflow and expired pricing fail closed to unknown configuration. Legacy compatibility rows must agree with current observed policy. Diagnostics expose only fixed reason counts and observed modes. Historical ledger versions and settled usage remain separate from current runtime observations.

`observedEnforcedConfiguration` can be true only when all currently observed evidence is fresh and consistent and both web and worker roles are represented. It is explicitly **not** a complete deployment-inventory assertion. `inventoryComplete` and `enforcementVerified` remain false, and headroom remains null: no trusted platform inventory, approved intended caps, provider invoice or live endpoint readiness has been established. An absent/stopped/unregistered process cannot be disproved from heartbeats, and no stale row is silently forgotten.

The public readiness response retains its existing boolean/count/build boundary. Operational cap/model/version metadata is stripped by the existing worker summary and is available only in the operator report.

Validation:

- 75 focused tests passed across ten files: attestation, web lifecycle, Next instrumentation, operator report unit/PGlite SQL integration, existing worker attestation/lifecycle, public readiness and the paid-call boundary/source guard.
- Tests cover consistent multiple instances; missing roles; stale/future clocks; mixed/missing/malformed caps/configuration; recomputed cap hash; all five model choices; price expiry; endpoint overrides; legacy evidence; inventory limits; serialized pulses; shutdown; HMR registration; contained database/startup failures; historical-versus-current policy; and public privacy.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `NEXT_DIST_DIR=.next-c1-attestation npm run build` passed, including Next.js production compilation/static generation and operations TypeScript compilation. Build-added generated type includes were removed afterward, preserving the repository's canonical configuration.
- Final integrated `NEXT_DIST_DIR=.next-c1-attestation npm run check` passed: lint, typecheck, 148 test files passed / 2 skipped; 1,096 tests passed / 3 skipped / 1 TODO; Next.js production build and operations build passed. The test stage took 233.49 seconds. The skips/TODO remain explicit and are not counted as passing validation.
- Independent `workflow_backend` review reported no actionable findings; attribution, scope and limits are recorded in `c1-attestation-review.md`.

No paid-boundary runtime or database schema code changed in this follow-up. The existing source-guard test was refined to allow the attestation module's official-host comparison literal as data while continuing to reject SDK calls/token-counting everywhere and fetch/client construction in that specific module. Local Next.js instrumentation guides were read before introducing the startup hook.
