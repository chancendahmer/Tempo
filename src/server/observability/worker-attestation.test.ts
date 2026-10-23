import { expect, it } from "vitest";
import { createWorkerAttestation, resolveBuildIdentity, summarizeWorkerAttestations, type WorkerHeartbeat } from "./worker-attestation";

const now = new Date("2026-10-22T12:00:00Z"), build = "abcdef1234567890";
const env = { TEMPO_BUILD_SHA: build, RAILWAY_GIT_COMMIT_SHA: undefined, INTERVENTION_SHADOW_MODE: true, AUTONOMOUS_SENDING_ENABLED: false, CLEANUP_CHECKINS_ENABLED: false, PROACTIVE_CANARY_USER_IDS: [] as string[] };
const queue = { blockedAccounts: 0, ambiguousOutbound: 0, pendingInbound: 0, oldestPendingSeconds: null };
const row = (metadata: Record<string, unknown> = createWorkerAttestation(env, queue), key = "tempo-worker:instance-a", age = 0): WorkerHeartbeat => ({ serviceKey: key, lastSeenAt: new Date(now.getTime() - age), metadata });

it("selects only validated build identities", () => {
  expect(resolveBuildIdentity({ RAILWAY_GIT_COMMIT_SHA: build.toUpperCase() })).toBe(build);
  expect(resolveBuildIdentity({ TEMPO_BUILD_SHA: "secret/configuration-value" })).toBeNull();
  expect(resolveBuildIdentity({})).toBeNull();
});
it("attests every fresh instance and never serializes raw metadata, IDs or canary targets", () => {
  const metadata = { ...createWorkerAttestation(env, queue), phone: "+12025550199", token: "private-token", workerId: "private-worker", canaryIds: ["private-account"] };
  const result = summarizeWorkerAttestations([row(metadata), row(metadata, "tempo-worker:instance-b"), row(metadata, "tempo-worker")], build, now);
  expect(result).toMatchObject({ ok: true, freshInstances: 2, allCoachingDisabled: true, builds: [build] });
  for (const value of ["+12025550199", "private-token", "private-worker", "private-account", "instance-a"]) expect(JSON.stringify(result)).not.toContain(value);
});
it.each([
  { CLEANUP_CHECKINS_ENABLED: true },
  { PROACTIVE_CANARY_USER_IDS: ["private-account"] },
  { INTERVENTION_SHADOW_MODE: false, AUTONOMOUS_SENDING_ENABLED: true },
])("reports independent cleanup, canary and global permission despite otherwise safe switches", override => {
  const summary = summarizeWorkerAttestations([row(createWorkerAttestation({ ...env, ...override }, queue))], build, now);
  expect(summary.ok).toBe(true);
  expect(summary.allCoachingDisabled).toBe(false);
  expect(summary.policy.cleanupPermission).toBe(true);
});
it("distinguishes healthy liveness from legacy/missing/unknown attestation", () => {
  const legacy = summarizeWorkerAttestations([row({ workerId: "old-worker", queueHealth: queue }, "tempo-worker")], build, now);
  expect(legacy).toMatchObject({ ok: false, allCoachingDisabled: false, policyKnown: false, newestAgeSeconds: 0 });
  expect(legacy.problems).toContain("worker_attestation_missing");
  expect(summarizeWorkerAttestations([], build, now).problems).toContain("worker_heartbeat_stale_or_missing");
  const mixed = summarizeWorkerAttestations([row(), row({ queueHealth: queue }, "tempo-worker")], build, now);
  expect(mixed.problems).toContain("legacy_worker_unattested");
  expect(mixed.allCoachingDisabled).toBe(false);
});
it.each([
  { ...createWorkerAttestation(env, queue), policy: { shadowMode: "true" } },
  { ...createWorkerAttestation(env, queue), queueHealth: { ...queue, pendingInbound: -1 } },
  { ...createWorkerAttestation(env, queue), queueHealth: { ...queue, blockedAccounts: NaN } },
  { ...createWorkerAttestation(env, queue), queueHealth: { ...queue, oldestPendingSeconds: "0" } },
  { ...createWorkerAttestation(env, queue), schemaVersion: 99 },
])("fails closed for malformed heartbeat metadata", metadata => {
  expect(summarizeWorkerAttestations([row(metadata)], build, now)).toMatchObject({ ok: false, policyKnown: false, allCoachingDisabled: false });
});
it("rejects unknown/different/overlapping builds and future worker clocks", () => {
  expect(summarizeWorkerAttestations([row({ ...createWorkerAttestation(env, queue), build: null })], build, now).problems).toContain("worker_build_unknown");
  expect(summarizeWorkerAttestations([row()], null, now).problems).toContain("web_build_unknown");
  const mixed = summarizeWorkerAttestations([row(), row({ ...createWorkerAttestation(env, queue), build: "1234567" }, "tempo-worker:other")], build, now);
  expect(mixed.problems).toContain("worker_build_mismatch");
  expect(summarizeWorkerAttestations([row(undefined, undefined, -1000)], build, now).problems).toContain("worker_clock_invalid");
});
it("does not count stale instances as live, bounds the population and carries queue failure codes", () => {
  expect(summarizeWorkerAttestations([row(undefined, undefined, 120_000)], build, now).ok).toBe(false);
  const overflow = Array.from({ length: 21 }, (_, index) => row(undefined, `tempo-worker:${index}`));
  expect(summarizeWorkerAttestations(overflow, build, now).problems).toContain("worker_attestation_limit_exceeded");
  expect(summarizeWorkerAttestations([row(createWorkerAttestation(env, { ...queue, blockedAccounts: 1 }))], build, now).queueProblems).toContain("blocked_accounts");
});

it.each([121_000, 700_000, 8 * 86_400_000])("never proves disabled coaching by expiring an observed sending instance (%i ms old)", age => {
  const unsafe = createWorkerAttestation({ ...env, INTERVENTION_SHADOW_MODE: false, AUTONOMOUS_SENDING_ENABLED: true }, queue);
  const summary = summarizeWorkerAttestations([row(), row(unsafe, "tempo-worker:unknown-stale", age)], build, now);
  // Fresh runtime readiness is distinct from a proof about all observed policy.
  expect(summary.ok).toBe(true);
  expect(summary).toMatchObject({ policyKnown: false, allCoachingDisabled: false, staleInstances: 1 });
  expect(summary.policy.cleanupPermission).toBeNull();
  expect(summary.problems).toContain("stale_worker_policy_unknown");
});
it("keeps stale/future legacy evidence unknown without double-counting a fresh compatibility snapshot", () => {
  expect(summarizeWorkerAttestations([row(), row(undefined, "tempo-worker")], build, now).allCoachingDisabled).toBe(true);
  for (const metadata of [createWorkerAttestation(env, queue), { workerId: "unattested" }]) {
    expect(summarizeWorkerAttestations([row(), row(metadata, "tempo-worker", 700_000)], build, now).allCoachingDisabled).toBe(false);
  }
  expect(summarizeWorkerAttestations([row(), row(undefined, "tempo-worker", -1)], build, now).allCoachingDisabled).toBe(false);
});
it("makes bounded inventory overflow unknown even when all fresh workers are safe", () => {
  const rows = [row(), ...Array.from({ length: 21 }, (_, index) => row(undefined, `tempo-worker:old-${index}`, 700_000))];
  const summary = summarizeWorkerAttestations(rows, build, now);
  expect(summary.ok).toBe(true);
  expect(summary.policyKnown).toBe(false);
  expect(summary.allCoachingDisabled).toBe(false);
  expect(summary.problems).toContain("worker_inventory_limit_exceeded");
});
