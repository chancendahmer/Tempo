import { randomUUID } from "node:crypto";
import { getServerEnv } from "../config/env";
import { OperationalRepository } from "../db/repositories/operational-repository";
import { logger } from "./logger";
import { createAiBudgetAttestation, WEB_INSTANCE_PREFIX } from "./ai-budget-attestation";
import { resolveBuildIdentity } from "./worker-attestation";
import { createHeartbeatLifecycle } from "../../worker/heartbeat-lifecycle";

type Dependencies = { write(): Promise<void>; failure(): void };
/** Serialized, nonfatal startup/periodic writes; no retirement claim while Next may still drain requests. */
export function startWebHeartbeat(dependencies: Dependencies) {
  const lifecycle = createHeartbeatLifecycle(dependencies.write);
  const pulse = () => { void lifecycle.pulse().catch(() => dependencies.failure()); };
  const timer = setInterval(pulse, 30_000); timer.unref();
  pulse();
  return { async stop() { clearInterval(timer); await lifecycle.stop().catch(() => dependencies.failure()); } };
}

const slot = Symbol.for("tempo.web-budget-heartbeat.v1");
type Global = typeof globalThis & { [slot]?: ReturnType<typeof startWebHeartbeat> };
/** Process-global singleton survives instrumentation reload/HMR; does not block sign-in or STOP on accounting DB failure. */
export function registerWebBudgetHeartbeat() {
  const global = globalThis as Global;
  if (global[slot]) return;
  const serviceKey = `${WEB_INSTANCE_PREFIX}${randomUUID()}`;
  global[slot] = startWebHeartbeat({
    async write() {
      const env = getServerEnv();
      await new OperationalRepository().heartbeat(serviceKey, { schemaVersion: 1, build: resolveBuildIdentity(env), aiBudget: createAiBudgetAttestation(env, process.env.ANTHROPIC_BASE_URL) });
    },
    failure() { logger.warn({ category: "budget_attestation" }, "web configuration heartbeat unavailable"); },
  });
  const stop = () => { void global[slot]?.stop(); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
}
