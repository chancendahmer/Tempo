# Read-only release access preflight

Observed **2026-10-23 17:13 UTC**, adaptive worktree only. The initial agent preflight performed no hosted changes, deploy, service creation, billing, messages, direct customer-database query, variables/environment dump, credential-store or secret configuration-file inspection, or secret-file read. Later root-executed aggregate-only observations are explicitly attributed below. This report is the agent’s only new repository mutation in this task.

## Approved release requirements inspected

DEPLOYMENT requires separate web/worker/PostgreSQL services and separated staging/production resources, service-specific Railway config paths, shared locked pre-deploy migrations, additive-schema preservation on rollback, matching deployed web/worker build stamps and readiness, then the manual provider matrix. OPERATIONS requires external deployment inventory as well as observed runtime attestations, provider-receipt reconciliation before replay, managed backup/restore evidence, an external readiness monitor, deployment-failure notifications and an identified alert owner. Local backup/queue/delivery-detector evidence does not prove hosted backup availability, restore success or alert receipt.

The checked-in configuration currently specifies web `npm run build` → `node dist-ops/scripts/migrate.js` → `npm run start`, `/api/health` liveness; worker `npm run typecheck` → `npm run db:migrate` → `npm run worker:start`. These are repository intent, not verified deployed service settings. Liveness alone cannot establish worker health, metering or safe rollback.

## Verified tools and GitHub state

- GitHub CLI **2.97.0** (2026-07-31), Git **2.39.1.windows.1**, local Node **v24.16.0**. Railway CLI did not resolve on PATH; no project-local Railway binary was found. No Railway connector capability was exposed. Railway CLI version, CLI authentication and linked project state were therefore **unknown**, not confirmed logged out. Root subsequently established existing Dashboard access; see the authenticated console follow-up.
- Successful purpose-built `gh repo`, `gh pr`, `gh run` and read-only `gh api` calls verify repository access. GitHub reports viewer permission **ADMIN** on [chancendahmer/Tempo](https://github.com/chancendahmer/Tempo). It reports `isPrivate=false`; this differs from DEPLOYMENT's private-repository wording. No repository visibility or permission setting was changed.
- Adaptive branch `codex/tempo-adaptive-home` remote and local HEAD: **49c30884bfb4a63416e5bf9e3c245e52d83ca56c**. It is 24 commits ahead/0 behind main **86ae01023abcf24bcc8da9ed9d367192e14a29ae**. Local tracked/untracked changes remain after that checkpoint; this SHA does not include all current fixes or rehearsal evidence.
- No PR exists for the adaptive branch. The open comparison/base UI [PR #26](https://github.com/chancendahmer/Tempo/pull/26) remains **draft**, head **db2abdecb811b4f9c083aec3692530b44a4ac9bc**, base main **86ae01023abcf24bcc8da9ed9d367192e14a29ae**; GitHub says CLEAN/MERGEABLE, with empty review verdict and empty status-check list. This is not release approval. Its last update was 2026-10-20T02:44:40Z.
- Candidate 49c3088 has zero check runs, zero Actions runs returned for its SHA, and zero deployment records returned for its SHA. Combined status returns `pending` with an empty statuses array; that is not evidence of a running or passing CI job. Main's branch metadata reports `protected=false`; this alone does not inventory every repository ruleset or release control.

## Railway evidence available indirectly

GitHub's latest returned deployment record is **6920835702**, created 2026-10-07T21:03:16Z, environment label `gentle-heart / production`, SHA **86ae01023abcf24bcc8da9ed9d367192e14a29ae**, final recorded status success 2026-10-07T21:11:46Z. Its `production_environment` field is false despite that environment label; labels do not prove intended environment separation. Only the newest 20 records were inspected, not a complete historical inventory.

Main's combined status has two historical successful Railway contexts at that same commit:

| Context | Service ID | Deployment ID | Last status timestamp |
|---|---|---|---|
| gentle-heart - Tempo | 791a008b-ef1b-4512-96e9-c06c8135661d | e4c16979-1cea-4f13-8dd8-96ec4020b9c1 | 2026-10-07T21:11:39Z |
| gentle-heart - tempo-worker | 374b891c-a4a5-42a8-aea9-a10499d4da38 | 7e8b8632-456e-42ff-89eb-99617fdf0ff7 | 2026-10-07T21:11:00Z |

Those links identify Railway project **c0ff0087-a154-47e7-a4ee-46ea873b8ebf** and environment **5181217d-906f-4605-856c-bc6c05b82dd2**. `Tempo` is only a historical service label here; its current web role/configuration was not independently attested. Both contexts reporting the same old commit is historical source-version evidence, not proof that both services still run that build, use the right config files, or are compatible with the current candidate/schema.

The deployment environment/log URLs point to the Railway dashboard, not a public Tempo app domain; GitHub homepageUrl is empty. In the initial GitHub-only phase no app URL was guessed, no dashboard HTTP 200 was mistaken for app health, and no public endpoint was probed. Root subsequently supplied the production URL already recorded in PILOT_HANDOFF; the actual public observations and source-only diagnosis follow below. No deployment logs were read.

## Known versus unknown release gates

| Gate | Result from this preflight |
|---|---|
| GitHub candidate/base identity and PR state | Verified above; adaptive candidate has no PR or remote checks/deploy record |
| Current Railway authentication/project/service inventory | Root subsequently authenticated in the existing Dashboard and observed production Postgres, Tempo and tempo-worker Online. CLI remains unavailable locally; complete instance/replica inventory is not established by these three service cards |
| Current deployed web and worker build/version compatibility | Selected worker console reports main 86ae010 and active deployment 7e8b8632; TEMPO_BUILD_SHA absent. Web public package v1.0.0 lacks a SHA. Full web/worker compatibility and every-instance attestation remain unverified; candidate 49c3088 is not the selected worker source stamp |
| Hosted migration/schema state and additive rollback compatibility | Unknown; no customer DB access or migration performed |
| Hosted backup schedule/inventory and completed restore evidence | Not observed through the command interface used; Dashboard access not checked during root browser QA; not evidence backups are absent |
| Hosted alert configuration, recipient ownership and actual receipt | Not observed here; Dashboard access not checked; GitHub status and local detection do not demonstrate delivery |

Without user intervention, GitHub release metadata is available and has been gathered. The command interface used could not establish Railway inventory/backup/monitor settings. CLI absence does not prove that an existing Railway browser session or Dashboard is unavailable; browser operations were deferred while root owned live QA and its separate browser inventory. Next safe evidence would be authenticated read-only Railway service/deployment and backup/monitor metadata, plus existing sanitized restore/alert receipts supplied through an approved interface. An actual new restore or alert-send drill would exceed this preflight's no-service-creation/no-messages scope and needs separate authorization. Missing access/evidence is **not a downtime, failed-deployment, disabled-backup or undelivered-alert claim**.

This preflight did not run the staging smoke script, invoke provider routes, change permissions, create a PR, merge, deploy, restart services or assess live customer records. No tests/build were needed for this documentation-only observation; the parent owns release decisions and checkpointing.


## Production public follow-up and non-disruptive diagnosis

Root supplied `https://tempo-production-8e25.up.railway.app`, matching PILOT_HANDOFF. Only unauthenticated GET `/api/health` and `/api/ready` were requested, with no cookies, manual redirect handling, bounded timeout, and output restricted to known safe version/status fields. No arbitrary response body, customer content, logs or variables were printed.

At **2026-10-23T17:17:58.102Z**, `/api/health` returned **HTTP 200**, `Cache-Control: no-store`, `ok:true`, service `tempo-web`, package version **1.0.0**, environment `production`; web flags were `shadowMode:true`, `autonomousSendingEnabled:false`, `cleanupCheckinsEnabled:true`. Server timestamp was 2026-10-23T17:17:56.205Z. **Build, configurationScope and canaryCount fields were absent.** These are web-reported values, not proof of worker flags, complete sending disablement or any exact deployed commit. Package 1.0.0 alone is not a source/build identity.

At **2026-10-23T17:17:58.442Z**, `/api/ready` returned **HTTP 503**, `Cache-Control: no-store`, `ok:false`, database `ready`, worker `ready`, workerAgeSeconds **8**, queue `degraded`. No workerAttestation object was present. A second read at **2026-10-23T17:18:30.018Z** again returned **HTTP 503**, with the sole known queue problem **`outbound_reconciliation_required`** and no other problem codes. This establishes an actual readiness failure at those observations while web liveness was 200. It does not establish total service downtime, a stopped worker, affected account counts, or the duration of the underlying condition.

To interpret the response without customer database/log access, the exact main revision **86ae01023abcf24bcc8da9ed9d367192e14a29ae** was read through GitHub's source API:

- [Readiness route](https://github.com/chancendahmer/Tempo/blob/86ae01023abcf24bcc8da9ed9d367192e14a29ae/src/app/api/ready/route.ts) checks database `select 1`, reads the single legacy `tempo-worker` heartbeat, labels its worker ready when age is below 120 seconds, and requires both worker freshness and zero queue problems for HTTP 200. It does not compare build identities or inventory every worker instance.
- [Queue rules](https://github.com/chancendahmer/Tempo/blob/86ae01023abcf24bcc8da9ed9d367192e14a29ae/src/server/domain/queue-health.ts) emit `blocked_accounts` when blockedAccounts>0; `outbound_reconciliation_required` when ambiguousOutbound>0; and `inbound_backlog_stale` when oldestPendingSeconds>660. Missing heartbeat queue fields instead produce `queue_health_unknown` at the route.
- [Direct message-health SQL](https://github.com/chancendahmer/Tempo/blob/86ae01023abcf24bcc8da9ed9d367192e14a29ae/src/server/db/repositories/operational-repository.ts) calculates ambiguousOutbound across **all-time outbound** rows with `outbound_state='ambiguous'`, or `outbound_state='submitting'` whose submission_started_at is older than **120 seconds**. This is not a confirmed-undelivered counter and has no report-window restriction.
- [Worker heartbeat writer](https://github.com/chancendahmer/Tempo/blob/86ae01023abcf24bcc8da9ed9d367192e14a29ae/src/worker/runtime.ts) combines message health with blocked inbound queue keys and writes that legacy heartbeat every **30seconds**. The inspected health route exposes exactly the older web fields observed publicly.

The public response shape is consistent with this historical contract; **that consistency and GitHub's October 7 deployment statuses do not prove this exact source revision is currently running**. A new hypothetical worker-health conclusion was not inferred from the web endpoint or this legacy freshness check.

Minimal operator action is to hold pilot rollout and inspect the exact account-scoped outbound ledger entries alongside authoritative provider receipts through an approved secure operational interface. An ambiguous or long-submitting entry may already have been accepted by a provider. Do not reset its ledger, bulk retry, delete history, or treat this code as proof of rejection. This read-only preflight performed no recovery, resend, service restart, policy change or customer-record inspection. Root owns Railway browser inventory and any separately authorized reconciliation or incident response.


## Root-observed authenticated console follow-up

The following results were **observed and supplied by root**, not executed by this agent. Root signed into the existing Railway Dashboard and observed production service cards Postgres, Tempo and tempo-worker Online. The active deployment IDs seen were web **e4c16979-1cea-4f13-8dd8-96ec4020b9c1** and worker **7e8b8632-456e-42ff-89eb-99617fdf0ff7**, matching the earlier historical GitHub status links. Those service cards do not alone inventory every process/replica or establish current web build policy.

At **2026-10-23T17:33:36Z**, root ran the prepared single aggregate SELECT in the already-connected worker console using its existing process DATABASE_URL internally. No connection string or credential was printed. `node` was absent from that console's PATH; readlink of `/proc/1/exe` identified **/mise/installs/node/24.21.0/bin/node**, which root used explicitly. The successful result verified **transaction_read_only=on** and **statement_timeout=5s**:

| Aggregate field | Observed value |
|---|---:|
| condition_rows | 35 |
| ambiguous_rows | 35 |
| stale_submitting_rows | 0 |
| receipt_reference_rows | 0 |
| created_over_1d_ago | 35 |
| created_over_7d_ago | 35 |
| oldest_created_hour_utc | 2026-08-20T01:00Z |
| latest_updated_hour_utc | 2026-09-30T15:00Z |

This is a current aggregate snapshot of older unresolved rows, not a historical state reconstruction, provider receipt, proof of rejection, or proof that all affected accounts/jobs are blocked. Zero stored receipt references does **not** prove that a provider never accepted a submission. No account/message IDs, body, phone number or provider-error text was queried or printed.

At **2026-10-23T17:34:44.051Z**, root's allowlisted selected-worker metadata command returned **RAILWAY_GIT_COMMIT_SHA=86ae01023abcf24bcc8da9ed9d367192e14a29ae**, **TEMPO_BUILD_SHA=null**, deployment **7e8b8632-456e-42ff-89eb-99617fdf0ff7**, and exact environment policy strings **shadow=true, autonomous=false, cleanup=true**. This identifies the selected worker's source stamp and selected process environment, not every instance's effective configuration or a proof that all sending is disabled. Cleanup remains an independent permission; carrier suppression, canary configuration and requested-message paths are separate concerns. No canary IDs or general environment listing were exposed.

Root performed no ledger/status mutation, provider query, retry, send or service change. The broader grouped/window SQL was **not executed**. There is no new receipt evidence and **readiness is not resolved**: the last public readiness observations remain HTTP 503 with `outbound_reconciliation_required`. Preserve the 35 obligations and require separately authorized, secure receipt/ledger reconciliation; do not reset/delete them merely because they are old or lack a stored receipt reference. Hosted backup, restore, alert delivery and rollout approval remain separate unverified gates.
