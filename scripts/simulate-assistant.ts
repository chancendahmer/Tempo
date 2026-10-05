import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AnthropicTaskIntentParser } from "../src/server/adapters/llm/task-intent-parser";
import { createAssistantSimulator } from "./lib/assistant-simulator";
import { assistantScenarios, scriptedScenarioParser } from "./lib/assistant-scenarios";

async function main() {
  const mode = process.argv.includes("--scripted") ? "scripted" : "live";
  if (mode === "live" && (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_MODEL)) {
    throw new Error("Live simulation requires ANTHROPIC_API_KEY and ANTHROPIC_MODEL in the process environment. No AI calls or production connections were made. Use --scripted only for explicitly labeled code-path testing.");
  }
  const simulation = await createAssistantSimulator(mode === "live" ? new AnthropicTaskIntentParser() : scriptedScenarioParser);
  const issues: string[] = [];
  const now = mode === "live" ? new Date() : new Date("2027-01-14T15:00:00Z");
  simulation.setTime(now);
  try {
    const user = await simulation.user();
    for (const scenario of assistantScenarios) {
      const before = await user.state();
      const turn = await user.send(scenario.message);
      const after = await user.state();
      if (turn.replies.length !== 1) issues.push(`${scenario.label}: expected one reply, got ${turn.replies.length}`);
      if (turn.replies.some((reply) => /trouble reaching my AI|couldn.t validate|couldn.t match|lost track/i.test(reply))) issues.push(`${scenario.label}: fallback response requires review`);
      if (scenario.conversational && (before.tasks.length !== after.tasks.length || before.reminders.length !== after.reminders.length || before.memories.length !== after.memories.length)) issues.push(`${scenario.label}: unexpected state mutation`);
      if (scenario.label === "relative reminder" && (after.reminders.length !== before.reminders.length + 1 || after.reminders.at(-1)!.remindAt.getTime() !== new Date(turn.decisionAt).getTime() + 120_000)) issues.push("relative reminder: missing or wrong due time");
      if (scenario.label === "complete reminder" && !after.reminders.some((item) => /dishes/i.test(item.text) && item.status === "completed")) issues.push("complete reminder: reminder was not completed");
      if (scenario.label === "reschedule reminder" && after.reminders.find((item) => /dishes/i.test(item.text))?.remindAt.getTime() === before.reminders.find((item) => /dishes/i.test(item.text))?.remindAt.getTime()) issues.push("reschedule reminder: due time did not change");
      if (scenario.label === "cancel reminder" && !after.reminders.some((item) => /Davis/i.test(item.text) && item.status === "cancelled")) issues.push("cancel reminder: reminder was not cancelled");
      if (scenario.label === "calendar proposal" && !turn.replies.some((reply) => /Reply YES/i.test(reply))) issues.push("calendar proposal: confirmation was not requested");
      if (scenario.label === "reject calendar" && after.calendarWrites.length) issues.push("reject calendar: calendar changed without YES");
      if (scenario.label === "forget one food" && after.memories.some((item) => /yogurt/i.test(item.content))) issues.push("forget one food: yogurt still present");
      process.stdout.write(`${scenario.label}: ${turn.elapsedMs}ms, ${turn.replies.length} captured reply\n`);
    }
    const original = user.transcript.find((turn) => turn.input.includes("in 2 minutes"))!;
    const replay = await user.send(original.input, { providerId: original.providerId });
    if (!replay.duplicate || replay.replies.length) issues.push("duplicate webhook: duplicated response");
    await user.send("Hello", { mediaUrl: "not-a-url" });
    const other = await simulation.user();
    await other.send("What are my favorite foods?");
    if ((await other.state()).memories.length) issues.push("user isolation: unexpected memory");
    const output = resolve("qa", `assistant-${mode}-latest.json`);
    await mkdir(resolve("qa"), { recursive: true });
    const report = { mode, model: mode === "live" ? process.env.ANTHROPIC_MODEL : null, generatedAt: new Date().toISOString(), limitations: "Temporary PGlite database; captured transport; fixture Google calendar; no real SMS, Google writes, or pg-boss worker. Scripted mode does not evaluate AI quality. Live mode sends only synthetic prompts to Anthropic and may incur API/search charges.", issues, transcript: user.transcript, secondUser: other.transcript, state: await user.state() };
    await writeFile(output, JSON.stringify(report, null, 2));
    const transcript = user.transcript.map((turn, index) => `### ${index + 1}. ${turn.input}\n\n${turn.replies.length ? turn.replies.map((reply) => `> ${reply.replaceAll("\n", "\n> ")}`).join("\n\n") : "(No reply: duplicate suppressed)"}\n\n${turn.elapsedMs} ms; tools: ${turn.tools.join(", ") || "none"}.`).join("\n\n");
    await writeFile(output.replace(/\.json$/, ".md"), `# Tempo ${mode} simulation\n\n${report.limitations}\n\nDetected issues: ${issues.length}\n${issues.map((issue) => `- ${issue}`).join("\n")}\n\n${transcript}\n`);
    process.stdout.write(`Saved ${output}; ${issues.length} issues detected. Read the transcript to assess conversational quality.\n`);
    if (issues.length) process.exitCode = 1;
  } finally { await simulation.close(); }
}
main().catch((error: unknown) => {
  // Never dump provider errors or environment objects, which can contain secrets.
  process.stderr.write(error instanceof Error && error.message.startsWith("Live simulation requires") ? `${error.message}\n` : "Simulation failed. No production data was used.\n");
  process.exitCode = 1;
});
