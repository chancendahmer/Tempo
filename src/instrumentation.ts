/** Node runtime only; startup observability failure never blocks request handling. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { registerWebBudgetHeartbeat } = await import("./server/observability/web-budget-heartbeat");
    registerWebBudgetHeartbeat();
  } catch { console.warn("Tempo web configuration attestation unavailable"); }
}
