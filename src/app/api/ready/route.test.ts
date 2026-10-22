import { beforeEach, expect, it, vi } from "vitest";
import { createWorkerAttestation } from "../../../server/observability/worker-attestation";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), heartbeats: vi.fn() }));
vi.mock("@/server/db/client", () => ({ getDatabase: () => ({ execute: mocks.execute }) }));
vi.mock("@/server/db/repositories/operational-repository", () => ({ OperationalRepository: class { getWorkerHeartbeats = mocks.heartbeats; } }));
vi.mock("@/server/config/env", () => ({ getServerEnv: () => ({ TEMPO_BUILD_SHA: "abcdef1234567" }) }));
vi.mock("@/server/observability/worker-attestation", async () => await import("../../../server/observability/worker-attestation"));
vi.mock("@/server/observability/logger", () => ({ logger: { error: vi.fn() } }));
import { GET } from "./route";
const env = { TEMPO_BUILD_SHA: "abcdef1234567", RAILWAY_GIT_COMMIT_SHA: undefined, INTERVENTION_SHADOW_MODE: true, AUTONOMOUS_SENDING_ENABLED: false, CLEANUP_CHECKINS_ENABLED: false, PROACTIVE_CANARY_USER_IDS: [] };
const queue = { blockedAccounts: 0, ambiguousOutbound: 0, pendingInbound: 0, oldestPendingSeconds: null };
const row = (metadata: Record<string, unknown>, serviceKey = "tempo-worker:private-instance") => ({ serviceKey, metadata, lastSeenAt: new Date() });
beforeEach(() => { vi.clearAllMocks(); mocks.execute.mockResolvedValue({}); mocks.heartbeats.mockResolvedValue([row(createWorkerAttestation(env, queue))]); });

it("requires actual worker policy/build evidence independently of the web configuration", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, worker: "ready", workerAttestation: { allCoachingDisabled: true, buildMatchesWeb: true } });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("does not present a fresh legacy worker as policy-attested", async () => {
  mocks.heartbeats.mockResolvedValue([row({ queueHealth: queue }, "tempo-worker")]);
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ ok: false, workerAttestation: { policyKnown: false, allCoachingDisabled: false, newestAgeSeconds: 0 } });
});
it("reports effective cleanup/canary permissions even when the web switches look disabled", async () => {
  mocks.heartbeats.mockResolvedValue([row({ ...createWorkerAttestation({ ...env, CLEANUP_CHECKINS_ENABLED: true }, queue), phone: "private-phone", token: "private-token" })]);
  const response = await GET();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.workerAttestation).toMatchObject({ allCoachingDisabled: false, policy: { cleanupPermission: true } });
  expect(JSON.stringify(body)).not.toContain("private-");
});
it.each([{ ...queue, blockedAccounts: 1 }, { ...queue, ambiguousOutbound: 1 }, { ...queue, oldestPendingSeconds: 661 }])("keeps operational queue problems unhealthy", async queueHealth => {
  mocks.heartbeats.mockResolvedValue([row(createWorkerAttestation(env, queueHealth))]);
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ ok: false, queue: "degraded" });
});
it("rejects malformed queue values and returns a private-data-free database failure", async () => {
  mocks.heartbeats.mockResolvedValue([row({ ...createWorkerAttestation(env, queue), queueHealth: { ...queue, pendingInbound: "0" } })]);
  expect((await GET()).status).toBe(503);
  mocks.execute.mockRejectedValue(new Error("private-database-details"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("private-");
});
