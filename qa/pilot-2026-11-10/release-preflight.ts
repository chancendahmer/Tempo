import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { serverEnvSchema } from "../../src/server/config/env";
import { createAiBudgetAttestation } from "../../src/server/observability/ai-budget-attestation";
import { resolveBuildIdentity } from "../../src/server/observability/worker-attestation";

// SHA-256 of JSON [[journal milliseconds as text, SHA-256 of exact Linux SQL bytes], ...].
// 0028 is the 86ae010 tree; later anchors come from the candidate journal through 0035.
const prefixAnchors: Readonly<Record<number, readonly [string, string]>> = {
  29: ["0028", "31cc54229e1a1d96f9e48a61f78731e8f97c909845c4423517466787820f0500"],
  30: ["0029", "7a155d11754215ee2583c9174077ce5291be4ecaf6dbf153ca50e8dfb271fe8a"],
  31: ["0030", "495b5c0b807247e8261b53ca241e9ea51696d89c798693d667bae7224d49dd12"],
  32: ["0031", "875a8633bf49d514ccdaa8f0fd8528e00d1ab88c2cf18edb5ea032662f50721f"],
  33: ["0032", "cb5a4ba99d5858246ac5e7a57f894a74c11e03367f1cea5ea471700900e05848"],
  34: ["0033", "139ae043c252d90ebeb77bdba02999fbda8d19d22069b884b5b2977ef1f72951"],
  35: ["0034", "1c545534ae764136e82c2ffab3670e8c20dc21c9c428606690bd458186fe840e"],
  36: ["0035", "93978cf7794077b6595361632983b57087223f50a658e070ea0b2defdd24368b"],
};
const baseline = "86ae01023abcf24bcc8da9ed9d367192e14a29ae";

function runtimeMetadata(env: NodeJS.ProcessEnv) {
  const parsed = serverEnvSchema.safeParse(env);
  const config = parsed.success ? parsed.data : undefined;
  const present = (value: string | undefined) => Boolean(value?.trim());
  const budget = createAiBudgetAttestation({
    AI_BUDGET_MODE: env.AI_BUDGET_MODE,
    AI_BUDGET_PRICE_VERSION: env.AI_BUDGET_PRICE_VERSION,
    AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS: env.AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS,
    AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS: env.AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS,
    AI_BUDGET_GLOBAL_DAILY_CALLS: env.AI_BUDGET_GLOBAL_DAILY_CALLS,
    AI_BUDGET_ACCOUNT_DAILY_CALLS: env.AI_BUDGET_ACCOUNT_DAILY_CALLS,
    ANTHROPIC_MODEL: env.ANTHROPIC_MODEL,
  }, env.ANTHROPIC_BASE_URL);
  const positiveCaps = budget.configuration && Object.values(budget.configuration.caps).every(value => Number(value) > 0);
  const build = resolveBuildIdentity({ TEMPO_BUILD_SHA: env.TEMPO_BUILD_SHA, RAILWAY_GIT_COMMIT_SHA: env.RAILWAY_GIT_COMMIT_SHA });
  const railwayBuild = resolveBuildIdentity({ RAILWAY_GIT_COMMIT_SHA: env.RAILWAY_GIT_COMMIT_SHA });
  let appPackageVersion: string | null = null;
  try {
    const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));
    if (name === "tempo" && typeof version === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) appPackageVersion = version;
  } catch { /* Metadata may be absent from a runtime image. */ }
  const appUrl = config && new URL(config.APP_BASE_URL);
  const oauthUrl = config?.GOOGLE_REDIRECT_URI && new URL(config.GOOGLE_REDIRECT_URI);
  const publicHttps = Boolean(appUrl && appUrl.protocol === "https:" && !appUrl.username && !appUrl.password
    && !["localhost", "127.0.0.1", "[::1]"].includes(appUrl.hostname));
  const role = env.RAILWAY_SERVICE_NAME?.toLowerCase();
  const environment = env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase();
  return {
    hosting: {
      role: role === "tempo-web" ? "web" : role === "tempo-worker" ? "worker" : "unknown",
      environment: environment === "production" || environment === "staging" ? environment : "other_or_unset",
      railwayDeploymentReferencePresent: present(env.RAILWAY_DEPLOYMENT_ID),
      railwayReplicaReferencePresent: present(env.RAILWAY_REPLICA_ID),
      nodeVersion: process.versions.node,
      appPackageVersion,
      build, railwayBuild,
      buildMatchesRailway: build && railwayBuild ? build === railwayBuild : null,
      observedBaselineBuild: build ? baseline.startsWith(build) : null,
    },
    config: {
      candidateSchemaValid: parsed.success,
      productionRuntime: env.NODE_ENV === "production",
      databaseUrlPresent: present(env.DATABASE_URL),
      publicHttps,
      encryptionKeyValid: config ? Boolean(config.FIELD_ENCRYPTION_KEY) : null,
      googleCredentialsPresent: present(env.GOOGLE_CLIENT_ID) && present(env.GOOGLE_CLIENT_SECRET),
      googleCallbackSameOrigin: Boolean(publicHttps && oauthUrl && oauthUrl.origin === appUrl?.origin && oauthUrl.pathname === "/api/auth/google/callback"),
      messagingProvider: config?.MESSAGING_PROVIDER ?? null,
      sendblueKeyPairPresent: present(env.SENDBLUE_API_KEY) && present(env.SENDBLUE_API_SECRET),
      sendblueWebhookSecretPresent: present(env.SENDBLUE_WEBHOOK_SECRET),
      sendblueLinePresent: present(env.SENDBLUE_PHONE_NUMBER),
      sendblueOfficialEndpoint: config ? ["https://api.sendblue.com", "https://api.sendblue.com/"].includes(config.SENDBLUE_API_BASE_URL) : null,
      admissionMode: config?.PILOT_ADMISSION_MODE ?? "invalid",
      admissionModeExplicit: present(env.PILOT_ADMISSION_MODE),
      inviteListValid: config ? config.PILOT_INVITED_PHONES !== null : null,
      inviteCount: config?.PILOT_INVITED_PHONES?.length ?? null,
      shadowMode: config?.INTERVENTION_SHADOW_MODE ?? null,
      autonomousSending: config?.AUTONOMOUS_SENDING_ENABLED ?? null,
      cleanupCheckins: config?.CLEANUP_CHECKINS_ENABLED ?? null,
      proactiveCanaryCount: config?.PROACTIVE_CANARY_USER_IDS.length ?? null,
      webSearchEnabled: config?.ASSISTANT_WEB_SEARCH_ENABLED ?? null,
      anthropicKeyPresent: present(env.ANTHROPIC_API_KEY),
      budgetMode: budget.mode,
      budgetConfiguration: budget.status,
      budgetReason: budget.reason,
      allBudgetCapsPositive: positiveCaps,
    },
  };
}

async function databaseMetadata(client: Client, build: string | null) {
  await client.query("begin isolation level repeatable read read only");
  try {
    await client.query("set local statement_timeout = '5s'");
    await client.query("set local lock_timeout = '1s'");
    const { rows: [catalog] } = await client.query<{
      ledger: boolean; heartbeat: boolean; queue: boolean; budget: boolean; receipts: boolean; dispositions: boolean;
    }>(`select to_regclass('drizzle.__drizzle_migrations') is not null as ledger,
      to_regclass('public.service_heartbeats') is not null as heartbeat,
      to_regclass('pgboss.job') is not null as queue,
      (to_regclass('public.ai_budget_states') is not null and to_regclass('public.ai_budget_attempts') is not null) as budget,
      to_regclass('public.pending_delivery_receipts') is not null as receipts,
      to_regclass('public.outbound_disposition_events') is not null as dispositions`);
    const ledger = catalog.ledger ? (await client.query<{ stamp: string; hash: string }>(
      "select created_at::text as stamp, hash from drizzle.__drizzle_migrations order by created_at, id limit 37",
    )).rows : [];
    const anchor = prefixAnchors[ledger.length];
    const digest = createHash("sha256").update(JSON.stringify(ledger.map(row => [row.stamp, row.hash]))).digest("hex");
    const exactPrefixThrough = anchor && digest === anchor[1] ? anchor[0] : null;
    const heartbeats = catalog.heartbeat ? (await client.query<{
      observed: number; freshLegacyWorker: number; freshWorkerInstances: number; freshWebInstances: number;
      freshWorkerBuildMatchesConsole: number; freshWebBuildMatchesConsole: number;
    }>(`with observed as (
      select case when service_key = 'tempo-worker' then 'legacy' when service_key like 'tempo-worker:%' then 'worker'
        when service_key like 'tempo-web:%' then 'web' end as role,
        last_seen_at between now() - interval '2 minutes' and now() as fresh,
        lower(metadata->>'build') = $1 as build_matches
      from public.service_heartbeats
      where service_key = 'tempo-worker' or service_key like 'tempo-worker:%' or service_key like 'tempo-web:%'
      limit 101
    ) select count(*)::int as "observed",
      (count(*) filter (where fresh and role = 'legacy'))::int as "freshLegacyWorker",
      (count(*) filter (where fresh and role = 'worker'))::int as "freshWorkerInstances",
      (count(*) filter (where fresh and role = 'web'))::int as "freshWebInstances",
      (count(*) filter (where fresh and role = 'worker' and build_matches))::int as "freshWorkerBuildMatchesConsole",
      (count(*) filter (where fresh and role = 'web' and build_matches))::int as "freshWebBuildMatchesConsole"
    from observed`, [build])).rows[0] : null;
    await client.query("commit");
    return { migrationLedger: { present: catalog.ledger, observedRows: ledger.length, countCapped: ledger.length === 37, exactPrefixThrough },
      databaseObjects: { queue: catalog.queue, budget: catalog.budget, receipts: catalog.receipts, dispositions: catalog.dispositions },
      heartbeats: heartbeats && { ...heartbeats, countCapped: heartbeats.observed === 101 } };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function main() {
  if (process.argv.length !== 2) throw new Error("invalid_arguments");
  const runtime = runtimeMetadata(process.env);
  if (!runtime.config.databaseUrlPresent) throw new Error("database_configuration_unavailable");
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 4_000,
    query_timeout: 7_000, application_name: "tempo-readonly-release-preflight" });
  client.on("error", () => undefined);
  try {
    await client.connect();
    const database = await databaseMetadata(client, runtime.hosting.build);
    process.stdout.write(JSON.stringify({ ok: true, readOnly: true, ...runtime, ...database }) + "\n");
  } finally { await client.end().catch(() => undefined); }
}
main().catch(error => {
  const known = ["invalid_arguments", "database_configuration_unavailable"];
  const outcome = error instanceof Error && known.includes(error.message) ? error.message : "release_preflight_failed";
  process.stderr.write(JSON.stringify({ ok: false, outcome }) + "\n");
  process.exitCode = 1;
});
