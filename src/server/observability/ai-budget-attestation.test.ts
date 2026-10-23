import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_PRICE_VALID_UNTIL, AI_PRICE_VERSION } from "../adapters/llm/ai-pricing";
import { createAiBudgetAttestation, summarizeAiBudgetAttestations } from "./ai-budget-attestation";
import { createWorkerAttestation, summarizeWorkerAttestations, type WorkerHeartbeat } from "./worker-attestation";

const now = new Date("2026-10-22T12:00:00Z"), build = "abcdef1234567";
// Synthetic test caps only; no operating allowance is established.
const source = { AI_BUDGET_MODE: "enforce", AI_BUDGET_PRICE_VERSION: AI_PRICE_VERSION, ANTHROPIC_MODEL: "claude-haiku-4-5-20251001", AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS: "1000", AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS: "100", AI_BUDGET_GLOBAL_DAILY_CALLS: "10", AI_BUDGET_ACCOUNT_DAILY_CALLS: "1" };
function row(role = "web", overrides: Partial<WorkerHeartbeat> = {}): WorkerHeartbeat {
  return { serviceKey: `tempo-${role}:private-instance`, lastSeenAt: now, metadata: { schemaVersion: 1, build, aiBudget: createAiBudgetAttestation(source, undefined, now) }, ...overrides };
}
const both = () => [row(), row("worker")];
describe("observed AI configuration attestation", () => {
  it("validates all five model choices against actual admission and never attests complete inventory", () => {
    const snapshot = createAiBudgetAttestation(source, undefined, now);
    expect(snapshot).toMatchObject({ status: "valid", mode: "enforce", providerHost: "api.anthropic.com", priceValidUntil: AI_PRICE_VALID_UNTIL, configuration: { caps: { globalDailyMicrodollars: "1000" } } });
    expect(Object.values(snapshot.configuration!.operationModels)).toEqual(Array(5).fill(source.ANTHROPIC_MODEL));
    const result = summarizeAiBudgetAttestations(both(), build, now);
    expect(result).toMatchObject({ observedEnforcedConfiguration: true, freshWebInstances: 1, freshWorkerInstances: 1, enforcementVerified: false, inventoryComplete: false, problems: [] });
    expect(JSON.stringify(result)).not.toContain("private-instance");
  });
  it.each([
    { AI_BUDGET_MODE: "off" }, { AI_BUDGET_MODE: "unknown" }, { AI_BUDGET_PRICE_VERSION: undefined },
    { AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS: undefined }, { AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS: "-1" },
    { AI_BUDGET_GLOBAL_DAILY_CALLS: "1.2" }, { AI_BUDGET_ACCOUNT_DAILY_CALLS: "9007199254740992" },
    { ANTHROPIC_MODEL: "private-unpriced-model" },
  ])("fails unknown/disabled for unsupported configured policy (%j)", override => {
    const snapshot = createAiBudgetAttestation({ ...source, ...override }, undefined, now);
    expect(snapshot.status).not.toBe("valid"); expect(snapshot.configuration).toBeNull();
    const rows = both(); rows[0].metadata.aiBudget = snapshot;
    expect(summarizeAiBudgetAttestations(rows, build, now).observedEnforcedConfiguration).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("private-unpriced-model");
  });
  it("rejects raw provider overrides without returning any host, credential or URL", () => {
    const snapshot = createAiBudgetAttestation(source, "https://private-key@private-proxy.example/secret", now);
    expect(snapshot).toMatchObject({ status: "invalid", reason: "unsupported_provider", providerHost: null, configuration: null });
    expect(JSON.stringify(snapshot)).not.toMatch(/private-key|private-proxy|secret/);
  });
  it("requires both web and worker observations, including multiple active instances", () => {
    for (const rows of [[], [row()], [row("worker")]]) expect(summarizeAiBudgetAttestations(rows, build, now).observedEnforcedConfiguration).toBe(false);
    expect(summarizeAiBudgetAttestations([...both(), row("web", { serviceKey: "tempo-web:second" })], build, now).observedEnforcedConfiguration).toBe(true);
  });
  it.each([120_000, 8 * 86_400_000, -1])("does not erase stale or future instance uncertainty at age %i", age => {
    const rows = [...both(), row("worker", { serviceKey: "tempo-worker:old", lastSeenAt: new Date(now.getTime() - age) })];
    expect(summarizeAiBudgetAttestations(rows, build, now)).toMatchObject({ observedEnforcedConfiguration: false, configuration: null, staleOrFutureInstances: 1 });
  });
  it("requires consistent policy, model, builds and a current reviewed price snapshot", () => {
    const rows = both();
    rows[0].metadata.aiBudget = createAiBudgetAttestation({ ...source, AI_BUDGET_ACCOUNT_DAILY_CALLS: "2" }, undefined, now);
    expect(summarizeAiBudgetAttestations(rows, build, now).problems).toContain("ai_budget_instance_configuration_mixed");
    rows[0] = row("web", { metadata: { ...row().metadata, build: "1234567" } });
    expect(summarizeAiBudgetAttestations(rows, build, now).problems).toContain("ai_budget_instance_build_unknown_or_mixed");
    const expired = new Date(AI_PRICE_VALID_UNTIL);
    expect(createAiBudgetAttestation(source, undefined, expired).reason).toBe("price_expired");
    expect(summarizeAiBudgetAttestations(both().map(value => ({ ...value, lastSeenAt: expired })), build, expired)).toMatchObject({ observedEnforcedConfiguration: false, priceExpired: true, configuration: null });
  });
  it("recomputes the cap hash and checks each operation model rather than trusting metadata", () => {
    for (const mutate of [
      (snapshot: ReturnType<typeof createAiBudgetAttestation>) => { snapshot.configuration!.caps.globalDailyCalls = "999"; },
      (snapshot: ReturnType<typeof createAiBudgetAttestation>) => { snapshot.configuration!.caps.globalDailyCalls = "private-malformed-value"; },
      (snapshot: ReturnType<typeof createAiBudgetAttestation>) => { snapshot.configuration!.caps.globalDailyCalls = "9".repeat(1000); },
      (snapshot: ReturnType<typeof createAiBudgetAttestation>) => { snapshot.configuration!.operationModels.intervention_review = "claude-sonnet-4-5-20250929"; },
    ]) {
      const snapshot = createAiBudgetAttestation(source, undefined, now); mutate(snapshot);
      expect(summarizeAiBudgetAttestations([row(), row("worker", { metadata: { schemaVersion: 1, build, aiBudget: snapshot } })], build, now).observedEnforcedConfiguration).toBe(false);
    }
  });
  it("treats unknown metadata, inventory overflow and inconsistent legacy evidence as unknown", () => {
    expect(summarizeAiBudgetAttestations([row(), row("worker", { metadata: { schemaVersion: 1, build } })], build, now).configuration).toBeNull();
    const legacy = row("worker", { serviceKey: "tempo-worker" });
    expect(summarizeAiBudgetAttestations([...both(), legacy], build, now).observedEnforcedConfiguration).toBe(true);
    legacy.metadata.aiBudget = createAiBudgetAttestation({ ...source, AI_BUDGET_GLOBAL_DAILY_CALLS: "11" }, undefined, now);
    expect(summarizeAiBudgetAttestations([...both(), legacy], build, now).problems).toContain("ai_budget_legacy_instance_unknown");
    const many = Array.from({ length: 21 }, (_, index) => row("web", { serviceKey: `tempo-web:${index}` }));
    expect(summarizeAiBudgetAttestations([...many, row("worker")], build, now).problems).toContain("ai_budget_inventory_limit_exceeded");
  });
  it("keeps operational caps/configuration out of public worker readiness aggregates", () => {
    const metadata = { ...createWorkerAttestation({ TEMPO_BUILD_SHA: build, INTERVENTION_SHADOW_MODE: true, AUTONOMOUS_SENDING_ENABLED: false, CLEANUP_CHECKINS_ENABLED: false, PROACTIVE_CANARY_USER_IDS: [] }, { blockedAccounts: 0, ambiguousOutbound: 0, pendingInbound: 0, oldestPendingSeconds: null }), aiBudget: createAiBudgetAttestation(source, undefined, now) };
    const publicResult = summarizeWorkerAttestations([row("worker", { metadata })], build, now);
    expect(publicResult.ok).toBe(true);
    expect(JSON.stringify(publicResult)).not.toMatch(/globalDailyMicrodollars|operationModels|priceVersion|policyVersion/);
  });
  it("tracks the current five adapter model sources in the versioned runtime footprint", async () => {
    for (const name of ["task-intent-parser", "turn-authorizer", "intervention-decision-reviewer", "intervention-composer", "task-presentation"]) {
      const source = await readFile(resolve(`src/server/adapters/llm/${name}.ts`), "utf8");
      expect(source).toMatch(/model:\s*env\.ANTHROPIC_MODEL!/);
      expect(source).not.toMatch(/model:\s*["'`]claude-/);
    }
  });
});
