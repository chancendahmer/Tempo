import { z } from "zod";
import { AI_PRICE_VALID_UNTIL, AI_PRICE_VERSION, buildAdmissionEnvelope } from "../adapters/llm/ai-pricing";
import { WORKER_FRESH_MS, WORKER_INSTANCE_PREFIX, MAX_ATTESTED_WORKERS, resolveBuildIdentity, type WorkerHeartbeat } from "./worker-attestation";

export const WEB_INSTANCE_PREFIX = "tempo-web:";
export const MAX_AI_ATTESTATION_ROWS = MAX_ATTESTED_WORKERS * 2 + 3;
const model = z.enum(["claude-haiku-4-5-20251001", "claude-sonnet-4-5-20250929"]);
const integerString = z.string().refine(value => value.length <= 16 && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER));
const capsSchema = z.object({ globalDailyMicrodollars: integerString, accountDailyMicrodollars: integerString, globalDailyCalls: integerString, accountDailyCalls: integerString }).strict();
const operationModelsSchema = z.object({ assistant: model, turn_authorization: model, intervention_review: model, intervention_composition: model, task_presentation: model }).strict();
const configurationSchema = z.object({ priceVersion: z.literal(AI_PRICE_VERSION), policyVersion: z.string().regex(/^v1-[a-f0-9]{64}$/), caps: capsSchema, operationModels: operationModelsSchema }).strict();
const snapshotSchema = z.object({
  schemaVersion: z.literal(1), mode: z.enum(["enforce", "off", "invalid"]),
  status: z.enum(["valid", "disabled", "invalid"]),
  reason: z.enum(["mode_off", "invalid_mode", "unsupported_provider", "invalid_configuration", "price_expired"]).nullable(),
  providerHost: z.literal("api.anthropic.com").nullable(),
  priceValidUntil: z.literal(AI_PRICE_VALID_UNTIL), configuration: configurationSchema.nullable(),
}).strict();
export type AiBudgetAttestation = z.infer<typeof snapshotSchema>;
type Source = {
  AI_BUDGET_MODE?: string; AI_BUDGET_PRICE_VERSION?: string; ANTHROPIC_MODEL?: string;
  AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS?: string; AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS?: string;
  AI_BUDGET_GLOBAL_DAILY_CALLS?: string; AI_BUDGET_ACCOUNT_DAILY_CALLS?: string;
};
/** No keys, raw model/URL text, content or identity enters the selected snapshot. */
export function createAiBudgetAttestation(source: Source, providerBaseUrl: string | undefined, now = new Date()): AiBudgetAttestation {
  const mode = source.AI_BUDGET_MODE === "enforce" ? "enforce" : source.AI_BUDGET_MODE === "off" || source.AI_BUDGET_MODE === undefined ? "off" : "invalid";
  const direct = providerBaseUrl === undefined || providerBaseUrl === "https://api.anthropic.com";
  const base = { schemaVersion: 1 as const, mode, providerHost: direct ? "api.anthropic.com" as const : null, priceValidUntil: AI_PRICE_VALID_UNTIL, configuration: null } as const;
  if (mode !== "enforce") return { ...base, status: mode === "off" ? "disabled" : "invalid", reason: mode === "off" ? "mode_off" : "invalid_mode" };
  if (!direct) return { ...base, status: "invalid", reason: "unsupported_provider" };
  if (now >= new Date(AI_PRICE_VALID_UNTIL)) return { ...base, status: "invalid", reason: "price_expired" };
  try {
    const envelope = buildAdmissionEnvelope({ model: source.ANTHROPIC_MODEL ?? "", max_tokens: 1, messages: [] }, now, source);
    const pinnedModel = model.parse(envelope.model);
    const operationModels = { assistant: pinnedModel, turn_authorization: pinnedModel, intervention_review: pinnedModel, intervention_composition: pinnedModel, task_presentation: pinnedModel };
    return snapshotSchema.parse({ ...base, status: "valid", reason: null, configuration: {
      priceVersion: envelope.priceVersion, policyVersion: envelope.policyVersion, operationModels,
      caps: Object.fromEntries(Object.entries(envelope.policy).map(([key, value]) => [key, String(value)])),
    } });
  } catch { return { ...base, status: "invalid", reason: "invalid_configuration" }; }
}

function validSnapshot(raw: unknown, now: Date) {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = parsed.data;
  if (value.mode !== "enforce" || value.status !== "valid" || value.reason !== null || value.providerHost !== "api.anthropic.com" || !value.configuration) return null;
  const config = value.configuration;
  const regenerated = createAiBudgetAttestation({ AI_BUDGET_MODE: "enforce", AI_BUDGET_PRICE_VERSION: config.priceVersion, ANTHROPIC_MODEL: config.operationModels.assistant,
    AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS: config.caps.globalDailyMicrodollars, AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS: config.caps.accountDailyMicrodollars,
    AI_BUDGET_GLOBAL_DAILY_CALLS: config.caps.globalDailyCalls, AI_BUDGET_ACCOUNT_DAILY_CALLS: config.caps.accountDailyCalls,
  }, undefined, now);
  return regenerated.status === "valid" && JSON.stringify(regenerated.configuration) === JSON.stringify(config) ? value : null;
}

/** Observed processes are not a trusted platform inventory. Never proves absent processes terminated. */
export function summarizeAiBudgetAttestations(rows: WorkerHeartbeat[], webBuild: string | null, now = new Date()) {
  const instances = rows.filter(row => row.serviceKey.startsWith(WORKER_INSTANCE_PREFIX) || row.serviceKey.startsWith(WEB_INSTANCE_PREFIX));
  const fresh = instances.filter(row => now.getTime() - row.lastSeenAt.getTime() >= 0 && now.getTime() - row.lastSeenAt.getTime() < WORKER_FRESH_MS);
  const workers = fresh.filter(row => row.serviceKey.startsWith(WORKER_INSTANCE_PREFIX));
  const webs = fresh.filter(row => row.serviceKey.startsWith(WEB_INSTANCE_PREFIX));
  const parsed = fresh.map(row => snapshotSchema.safeParse(row.metadata.aiBudget));
  const values = fresh.map(row => row.metadata.schemaVersion === 1 ? validSnapshot(row.metadata.aiBudget, now) : null);
  const valid = values.flatMap(value => value?.configuration ? [value.configuration] : []);
  const configs = [...new Set(valid.map(value => JSON.stringify(value)))];
  const builds = fresh.map(row => resolveBuildIdentity({ TEMPO_BUILD_SHA: typeof row.metadata.build === "string" ? row.metadata.build : undefined }));
  const legacy = rows.find(row => row.serviceKey === "tempo-worker");
  const legacyAge = legacy ? now.getTime() - legacy.lastSeenAt.getTime() : -1;
  const legacyValue = legacy && legacy.metadata.schemaVersion === 1 ? validSnapshot(legacy.metadata.aiBudget, now) : null;
  const legacyUnknown = Boolean(legacy && (legacyAge < 0 || legacyAge >= WORKER_FRESH_MS || !legacyValue
    || !configs.includes(JSON.stringify(legacyValue.configuration)) || legacy.metadata.build !== webBuild));
  const overflow = instances.length > MAX_ATTESTED_WORKERS * 2 || rows.length >= MAX_AI_ATTESTATION_ROWS
    || instances.filter(row => row.serviceKey.startsWith(WEB_INSTANCE_PREFIX)).length > MAX_ATTESTED_WORKERS
    || instances.filter(row => row.serviceKey.startsWith(WORKER_INSTANCE_PREFIX)).length > MAX_ATTESTED_WORKERS;
  const priceExpired = now >= new Date(AI_PRICE_VALID_UNTIL);
  const configurationFailures = { mode_off: 0, invalid_mode: 0, unsupported_provider: 0, invalid_configuration: 0, price_expired: 0, missing_or_malformed: 0 };
  values.forEach((value, index) => {
    if (value) return;
    const snapshot = parsed[index];
    if (!snapshot.success || fresh[index].metadata.schemaVersion !== 1) configurationFailures.missing_or_malformed += 1;
    else if (snapshot.data.reason) configurationFailures[snapshot.data.reason] += 1;
    else if (priceExpired) configurationFailures.price_expired += 1;
    else configurationFailures.invalid_configuration += 1;
  });
  const problems = [
    ...(!webs.length ? ["ai_budget_web_instance_missing"] : []), ...(!workers.length ? ["ai_budget_worker_instance_missing"] : []),
    ...(instances.length !== fresh.length ? ["ai_budget_instance_stale_or_clock_invalid"] : []),
    ...(overflow ? ["ai_budget_inventory_limit_exceeded"] : []), ...(legacyUnknown ? ["ai_budget_legacy_instance_unknown"] : []),
    ...(values.some(value => value === null) ? ["ai_budget_instance_configuration_unknown"] : []),
    ...(configs.length > 1 ? ["ai_budget_instance_configuration_mixed"] : []),
    ...(!webBuild || builds.some(build => build === null || build !== webBuild) ? ["ai_budget_instance_build_unknown_or_mixed"] : []),
    ...(priceExpired ? ["ai_budget_price_expired"] : []),
  ];
  const observedEnforcedConfiguration = problems.length === 0;
  return {
    observedEnforcedConfiguration, configuration: observedEnforcedConfiguration ? valid[0] : null,
    observedInstances: instances.length, freshWebInstances: webs.length, freshWorkerInstances: workers.length,
    staleOrFutureInstances: instances.length - fresh.length, unknownConfigurationInstances: values.filter(value => value === null).length,
    observedModes: [...new Set(parsed.flatMap(value => value.success ? [value.data.mode] : []))].sort(), configurationFailures,
    expectedPriceVersion: AI_PRICE_VERSION, priceValidUntil: AI_PRICE_VALID_UNTIL, priceExpired,
    inventoryComplete: false as const, enforcementVerified: false as const,
    scope: "Only registered web/worker instance heartbeats are observed; platform inventory and retirement evidence are not available.",
    problems,
  };
}
