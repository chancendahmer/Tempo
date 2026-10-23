# R1 reliability evidence — 2026-10-22

## Scope and reproduction

Implemented `scripts/pilot-load.ts` plus `scripts/pilot-load-config.ts`. Run from the repository root:

```powershell
npx tsx scripts/pilot-load.ts
npx tsx scripts/pilot-load.ts --accounts 100
```

The first command defaults to twenty accounts; the second uses the maximum of 100. There is no package.json integration requirement. A convenience `pilot:load` npm alias can invoke `tsx scripts/pilot-load.ts` if desired.

The only accepted administrative target is the deliberately public local fixture `postgresql://postgres@127.0.0.1:55437/tempo_ui_release`. The harness never selects DATABASE_URL as its connection target, loads populated environment files or uses provider credentials. It creates a new random `tempo_pilot_<16 hex characters>_test` database, migrates only that database and drops only that exact run-owned name after closing its connections. Shared fixtures are preserved. A failed hard deadline prints the run-owned database name for isolated inspection; it never attempts broad fixture cleanup. External HTTP is blocked in-process. SMS delivery uses a captured transport and model decisions are scripted; no provider SDK is instantiated by the drill.

Two simultaneous dispatcher calls exercise transactional enqueue and `SKIP LOCKED`; one process runs four pg-boss consumers with the production strict account FIFO policy, inbound ownership/repositories, conversation orchestrator, durable outbound ledger and web reply sender. Each account concurrently ingests a duplicated SMS task capture followed by a web assistant turn. Every tenth account receives one deliberate provider rejection explicitly marked **not accepted**, followed by a pg-boss retry. Captured acceptance remains exactly once. Normal transport delay is 100 ms, delayed transport is 350 ms, and scripted parsing is 100 ms. This deliberately produces a burst exceeding the four-consumer envelope.

The maximum work is 100 accounts, two distinct inbound turns/account, one duplicate webhook/account and two configured retries/job. Work cancellation starts after 105 seconds, reserving fifteen seconds for cleanup; an independent watchdog terminates only this script process at the hard 120-second ceiling even if an async operation stalls. PostgreSQL application queries and connection attempts also have explicit timeouts. Ordinary success is emitted only after the run-owned database is successfully removed.

## Fresh observations

Measurements are elapsed local wall-clock observations, with nearest-rank p50/p95. They are not service-level promises. The source uses an accelerated one-second retry delay and 30-second queue expiry, unlike the production 60-second retry delay/ten-minute inbound expiry. No production connection limit, hosted compute, provider rate limit, actual model latency or carrier behavior was exercised.

The first R1 frozen-source command `npx tsx scripts/pilot-load.ts --accounts 100` passed and removed its isolated database. Raw aggregate output: [reliability-load-100.json](reliability-load-100.json). The subsequent independent replay found a local PostgreSQL infrastructure failure described below; preserve this output as a historical observation, not a claim that the current local cluster is healthy.

| Observation | Result |
| --- | --- |
| Accounts / distinct inbound turns | 100 / 200 |
| Duplicate webhook receipts correctly suppressed | 100 |
| Captured provider acceptances | 100, exactly once each |
| Deliberate transient rejection / actual job retry | 10 / 10 |
| Active consumers / dispatchers | Four / two |
| Active high-water / inbound backlog high-water / live queue high-water | 4 / 200 / 196 |
| Healthy turns completed before the first fault recovery | 17 |
| Ingress batch / workload drain / setup + workload | 1.243 s / 28.029 s / 29.148 s |
| Observed workload throughput | 7.14 distinct inbound turns/s |
| Account ingress p50 / p95 / max (100 samples) | 1.232 s / 1.234 s / 1.235 s |
| Ingress-to-first-start p50 / p95 / max (200 samples) | 15.120 s / 26.398 s / 27.790 s |
| Ingress-to-completion p50 / p95 / max (200 samples) | 15.330 s / 26.526 s / 27.934 s |
| Final unfinished actions / pending inbound / uncertain outbound / blocked accounts | 0 / 0 / 0 / 0 |
| Run-owned database removed | Yes |

The twenty-account default also passed: 40 inbound turns, twenty duplicate receipts, twenty captured provider acceptances, two deliberate rejections/two retries, active high-water four, inbound/queue high-water forty, and zero unfinished actions, pending inbound, uncertain outbound or blocked accounts. Workload drain was 5.463 seconds and p95 completion 5.161 seconds in that observation.

### Subsequent independent replay and infrastructure block

An independent twenty-account replay later failed during database creation. A narrow local probe confirmed both available templates are unusable: `CREATE DATABASE` with `TEMPLATE template1` failed PostgreSQL code `58P01`, missing `base/1/4171`; the same operation with `TEMPLATE template0` failed `58P01`, missing `base/4/pg_filenode.map`. The catalog still listed template1 (OID 1), template0 (OID 4) and the existing `tempo_ui_release` database. Both probes used random run-owned `_test` target names, failed before creation, and did not modify/reset either template, the cluster or any shared fixture. No safe alternate template was available. The prior successful 100-account output remains intact. A fresh healthy isolated cluster or an independently approved repair is needed before current-source real-PostgreSQL replay can be claimed again.

Review also identified that A1's new admission boundary could cause the harness's repository to consult ambient admission configuration. The harness now injects an explicit synthetic open admission policy. A new isolated PGlite integration regression uses closed/invalid ambient admission, verifies synthetic START ingestion, and verifies the environment getter is never called during that repository operation. This closes the dependency without opening production admission. The earlier real-PostgreSQL observations precede this small injection change; its current-source replay was blocked until the separate-cluster resolution below.

### Fresh-cluster resolution and current-source replay

The principal engineer subsequently established a **separate new persistent local cluster** at `C:/Users/chanc/.codex/runtimes/tempo-pg17-20261022/data`, using the same loopback port 55437 and an empty `tempo_ui_release` base. The old cluster process was stopped gracefully and its files preserved; neither damaged template was repaired or silently used as a fallback. After A2's migration `0032` stabilized, the current harness (including explicit synthetic admission) created, migrated and removed its own random `_test` database successfully. No shared base/preview fixture was changed by this replay.

Fresh current-source command `npx tsx scripts/pilot-load.ts --accounts 100` passed. Raw output is [reliability-load-100-fresh.json](reliability-load-100-fresh.json): 200 turns, 100 duplicate suppressions, 100 one-time captured acceptances, ten definite rejections and ten retries; four active consumers, inbound and queue high-water 200; 28.302 seconds workload drain, p95 completion 26.919 seconds, max 28.274 seconds; zero unfinished/pending/uncertain/blocked work and the run-owned database removed. The independent reviewer subsequently reported a fresh twenty-account replay passed. These remain local scripted workload observations, not provider/hosted/model capacity certification.

## R2 operational evidence

Worker build/effective-policy attestation, read-only reporting and the corrected runbook are implemented. See [reliability-r2.md](reliability-r2.md) for interfaces, validation, independent stale-worker/shutdown findings and their resolution. R2 adds no schema migration or deployment configuration change.

Each run asserts duplicate ingestion, chronological completion within every account, account-private model context and replies, one task and one mutation event/account despite retry, one captured acceptance per SMS operation, healthy-account progress before fault recovery, a backlog exceeding consumer capacity, and complete drain of scheduled actions, inbound messages and pg-boss jobs. It also checks zero blocked account keys and zero uncertain/reserved outbound operations.

## Adapter deadline fix and validation

`intervention-composer.ts` and `intervention-decision-reviewer.ts` now explicitly configure `timeout: 15_000` and `maxRetries: 0`, comfortably below their 120-second queue expiry. No prompt, model, token maximum, deterministic fallback, reviewer threshold or permission gate changed. SDK timeout/rate-limit failures are simulated in tests; these are not observed real-provider failures. Existing composer safety validation and reviewer fallback behavior are preserved, including its existing deterministic high-confidence fallback.

- Focused command: `npm run test -- src/server/testing/pilot-load.test.ts src/server/adapters/llm/intervention-composer.test.ts src/server/adapters/llm/intervention-decision-reviewer.test.ts src/server/domain/context-evaluation-service.test.ts src/server/domain/intervention-strategy.test.ts` — **five files / 28 tests passed**.
- After the independent-review admission injection: `npm run test -- src/server/testing/pilot-load.test.ts src/server/testing/pilot-load.integration.test.ts src/server/adapters/llm/intervention-composer.test.ts src/server/adapters/llm/intervention-decision-reviewer.test.ts` — **four files / 24 tests passed**. Subsequent full lint and typecheck both passed.
- `npm run typecheck` — **passed** after concurrent workspace edits settled. Earlier runs exposed a missing ID in the new test fixture (fixed), then transient workspace narrowing/return-type errors owned by the workflows agent; none remained in the successful run.
- `npm run lint` — **passed**; final rerun recorded with the final load observation.
- Full repository `npm run check` is owned by the principal engineer for integration; it was not run by this package owner.

## Remaining evidence

This is a local correctness and burst/drain envelope. It does not certify real-worker multi-process or kill/restart behavior, live model quality/cost, real carrier delivery, provider capacity at 100 people, hosted connection/memory limits, monitoring notification delivery, backup restoration/key recovery, retention, production migrations or release readiness. Reuse the existing restart drill for durable-boundary crash evidence and obtain the external gates listed in [reliability-audit.md](reliability-audit.md) before expanding the pilot.
