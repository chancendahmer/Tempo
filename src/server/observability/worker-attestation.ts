import { z } from "zod";
import type { ServerEnv } from "../config/env";
import { queueHealthProblems, type QueueHealth } from "../domain/queue-health";

export const WORKER_FRESH_MS = 120_000;
export const MAX_ATTESTED_WORKERS = 20;
export const WORKER_INSTANCE_PREFIX = "tempo-worker:";
const buildPattern = /^[a-f0-9]{7,40}$/i;
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const queueHealthSchema = z.object({ blockedAccounts: count, ambiguousOutbound: count, pendingInbound: count, oldestPendingSeconds: count.nullable() });
const attestationSchema = z.object({
  schemaVersion: z.literal(1), build: z.string().regex(buildPattern).nullable(),
  policy: z.object({ shadowMode: z.boolean(), autonomousSendingEnabled: z.boolean(), cleanupCheckinsEnabled: z.boolean(), canaryCount: count.max(20) }),
  queueHealth: queueHealthSchema,
});
export type WorkerAttestation = z.infer<typeof attestationSchema>;
export type WorkerHeartbeat = { serviceKey: string; lastSeenAt: Date; metadata: Record<string, unknown> };

/** Select only known build variables, never arbitrary deployment/environment text. */
export function resolveBuildIdentity(source: { TEMPO_BUILD_SHA?: string; RAILWAY_GIT_COMMIT_SHA?: string }): string | null {
  const value = source.TEMPO_BUILD_SHA || source.RAILWAY_GIT_COMMIT_SHA;
  return value && buildPattern.test(value) ? value.toLowerCase() : null;
}

export function createWorkerAttestation(env: Pick<ServerEnv, "INTERVENTION_SHADOW_MODE" | "AUTONOMOUS_SENDING_ENABLED" | "CLEANUP_CHECKINS_ENABLED" | "PROACTIVE_CANARY_USER_IDS" | "TEMPO_BUILD_SHA" | "RAILWAY_GIT_COMMIT_SHA">, queueHealth: QueueHealth): WorkerAttestation {
  return attestationSchema.parse({ schemaVersion: 1, build: resolveBuildIdentity(env), policy: {
    shadowMode: env.INTERVENTION_SHADOW_MODE, autonomousSendingEnabled: env.AUTONOMOUS_SENDING_ENABLED,
    cleanupCheckinsEnabled: env.CLEANUP_CHECKINS_ENABLED, canaryCount: env.PROACTIVE_CANARY_USER_IDS.length,
  }, queueHealth });
}

/** Public-safe aggregates only. Unknown or stale evidence can never prove a kill switch. */
export function summarizeWorkerAttestations(rows: WorkerHeartbeat[], webBuild: string | null, now = new Date()) {
  const instances = rows.filter(row => row.serviceKey.startsWith(WORKER_INSTANCE_PREFIX));
  const fresh = instances.filter(row => now.getTime() - row.lastSeenAt.getTime() >= 0 && now.getTime() - row.lastSeenAt.getTime() < WORKER_FRESH_MS);
  const parsed = fresh.map(row => attestationSchema.safeParse(row.metadata));
  const valid = parsed.flatMap(result => result.success ? [result.data] : []);
  const legacy = rows.find(row => row.serviceKey === "tempo-worker");
  const legacyFresh = legacy && now.getTime() - legacy.lastSeenAt.getTime() >= 0 && now.getTime() - legacy.lastSeenAt.getTime() < WORKER_FRESH_MS;
  const legacyUnknown = Boolean(legacy && !attestationSchema.safeParse(legacy.metadata).success);
  const inventoryOverflow = instances.length > MAX_ATTESTED_WORKERS;
  const freshOverflow = fresh.length > MAX_ATTESTED_WORKERS;
  const activeKnown = fresh.length > 0 && valid.length === fresh.length && !freshOverflow && !(legacyFresh && legacyUnknown);
  const staleEvidence = instances.length !== fresh.length || Boolean(legacy && !legacyFresh);
  const policyKnown = activeKnown && !inventoryOverflow && !staleEvidence && !legacyUnknown;
  const builds = [...new Set(valid.flatMap(value => value.build ? [value.build.toLowerCase()] : []))].sort();
  const buildKnown = activeKnown && valid.every(value => value.build !== null);
  const buildMatchesWeb = buildKnown && webBuild !== null && builds.length === 1 && builds[0] === webBuild;
  const proactivePermission = valid.some(value => (!value.policy.shadowMode && value.policy.autonomousSendingEnabled) || value.policy.canaryCount > 0);
  const cleanupPermission = proactivePermission || valid.some(value => value.policy.cleanupCheckinsEnabled);
  const queueProblems = [...new Set(valid.flatMap(value => queueHealthProblems(value.queueHealth)))];
  const activeProblems = [
    ...(!fresh.length ? [legacyFresh ? "worker_attestation_missing" : "worker_heartbeat_stale_or_missing"] : []),
    ...(parsed.some(value => !value.success) ? ["worker_attestation_invalid"] : []),
    ...(instances.some(row => row.lastSeenAt.getTime() > now.getTime()) ? ["worker_clock_invalid"] : []),
    ...(legacyFresh && legacyUnknown ? ["legacy_worker_unattested"] : []),
    ...(freshOverflow ? ["worker_attestation_limit_exceeded"] : []),
    ...(activeKnown && !buildKnown ? ["worker_build_unknown"] : []),
    ...(!webBuild ? ["web_build_unknown"] : []),
    ...(buildKnown && webBuild && !buildMatchesWeb ? ["worker_build_mismatch"] : []),
  ];
  const problems = [...activeProblems,
    ...(staleEvidence ? ["stale_worker_policy_unknown"] : []),
    ...(inventoryOverflow ? ["worker_inventory_limit_exceeded"] : []),
    ...(legacyUnknown && !legacyFresh ? ["legacy_worker_unattested"] : []),
  ];
  const ages = (instances.length ? instances : legacy ? [legacy] : []).map(row => Math.floor((now.getTime() - row.lastSeenAt.getTime()) / 1000));
  return {
    ok: activeKnown && buildMatchesWeb && !activeProblems.length,
    observedInstances: instances.length, freshInstances: fresh.length, staleInstances: instances.length - fresh.length,
    unknownInstances: parsed.filter(result => !result.success).length, policyKnown,
    buildKnown, buildMatchesWeb, builds, newestAgeSeconds: ages.length ? Math.min(...ages) : null,
    allCoachingDisabled: policyKnown && buildMatchesWeb && !proactivePermission && !cleanupPermission,
    policy: {
      allShadowMode: policyKnown ? valid.every(value => value.policy.shadowMode) : null,
      anyAutonomousSendingEnabled: policyKnown ? valid.some(value => value.policy.autonomousSendingEnabled) : null,
      anyCleanupCheckinsEnabled: policyKnown ? valid.some(value => value.policy.cleanupCheckinsEnabled) : null,
      canaryCount: policyKnown ? valid.reduce((total, value) => total + value.policy.canaryCount, 0) : null,
      proactivePermission: policyKnown ? proactivePermission : null, cleanupPermission: policyKnown ? cleanupPermission : null,
    },
    queueProblems: activeKnown ? queueProblems : [...new Set([...queueProblems, "queue_health_unknown"])], problems,
  };
}
