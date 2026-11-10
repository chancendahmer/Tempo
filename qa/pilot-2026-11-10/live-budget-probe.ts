import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { liveQaProbeMaxTokens, liveQaProbeModel, liveQaProbePrompt, withLiveQaBudgetRecoveryProbe } from "./live-budget";

async function main() {
  const [runtime, ...extra] = process.argv.slice(2);
  if (!runtime || runtime.startsWith("-") || extra.length) throw new Error("Expected one existing runtime directory.");
  loadEnvConfig(runtime, true, { info() {}, error() {} });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Configured runtime key unavailable.");
  for (const name of Object.keys(process.env)) if (/^(ANTHROPIC_|PG)/i.test(name)) delete process.env[name];
  process.env.ANTHROPIC_LOG = "off";

  const prior = z.object({ kind: z.literal("uncertain"), id: z.uuid(), status: z.literal(200), category: z.literal("invalid_usage") })
    .parse(JSON.parse(await readFile("qa/pilot-2026-11-10/private/live-budget-10/000002.json", "utf8")));
  await withLiveQaBudgetRecoveryProbe(prior.id, async budget => {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: key, authToken: null, baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: 15000 });
      const response = await client.messages.create({ model: liveQaProbeModel, max_tokens: liveQaProbeMaxTokens, messages: [{ role: "user", content: liveQaProbePrompt }] });
      console.log(JSON.stringify({ outcome: "settled", modelMatches: response.model === liveQaProbeModel, budget: budget.snapshot() }));
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : null;
      console.error(JSON.stringify({ outcome: "failed", status, budget: budget.snapshot() }));
      process.exitCode = 1;
    }
  });
}
void main().catch(() => {
  console.error(JSON.stringify({ outcome: "not_submitted", category: "probe_setup" }));
  process.exitCode = 1;
});
