/** Explicit single-call fictional-title check. No database, SMS, or personal records. */
import { loadEnvConfig } from "@next/env";
import { suggestTaskPresentations } from "../../src/server/adapters/llm/task-presentation";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const runtimeRoot = process.argv[2];
  if (!runtimeRoot) throw new Error("Provide the existing application runtime root.");
  // Same loader as Next, no secret-file reads or credential output.
  loadEnvConfig(runtimeRoot, true, { info() {}, error() {} });
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("Configured application runtime has no Anthropic key; live check skipped.");
    return;
  }
  const titles = ["Write a report about nutrition", "Pick up oats and yogurt", "Pack my bag", "Upper body workout", "Wash the dishes"];
  const input = titles.map((title, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, title, estimatedMinutes: null }));
  let usage: unknown;
  try {
    const result = await suggestTaskPresentations(input, value => { usage = value; });
    const report = { timestamp: new Date().toISOString(), evidence: "one real provider call; fictional titles only", usage, results: result.tasks.map(task => ({ title: input.find(row => row.id === task.id)?.title, ...task })) };
    await writeFile(resolve("qa/adaptive-home/live-model-result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    // Provider SDK messages can contain request headers: report only status/type.
    const e = error as { status?: number; name?: string };
    console.log(JSON.stringify({ liveTest: "failed", status: e.status ?? null, type: e.name ?? "Error", usage: usage ?? null }));
    process.exitCode = 1;
  }
}
void main();
