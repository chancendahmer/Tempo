import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { AnthropicTaskIntentParser } from "../src/server/adapters/llm/task-intent-parser";
import { createAssistantSimulator } from "./lib/assistant-simulator";
import { scriptedWorkspaceParser, workspaceJourney } from "./lib/workspace-journey";
import { evaluateWorkspaceChange, workspaceProductState } from "./lib/workspace-evaluation";
import { mutateWorkspace } from "../src/server/db/repositories/workspace-repository";

async function main() {
  const scripted = process.argv.includes("--scripted");
  if (!scripted && (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_MODEL)) throw new Error("Live workspace journey requires ANTHROPIC_API_KEY and ANTHROPIC_MODEL in the process environment. No calls were made.");
  const simulation = await createAssistantSimulator(scripted ? scriptedWorkspaceParser : new AnthropicTaskIntentParser());
  simulation.setTime(new Date("2027-01-14T15:00:00Z"));
  try {
    const person = await simulation.user();
    const outsider = await simulation.user();
    await mutateWorkspace(outsider.id, { action: "save", id: randomUUID(), version: 0, data: { kind: "note", title: "OUTSIDER_PRIVATE_MARKER", body: "Must never enter the demo account context or replies." } }, simulation.database);
    const foreignBefore = workspaceProductState(await outsider.workspace());
    const iterations = [];
    for (const step of workspaceJourney) {
      const before = await person.workspace();
      const turn = await person.send(step.message, { channel: step.channel });
      const after = await person.workspace();
      const foreign = await outsider.workspace();
      const issues = evaluateWorkspaceChange(step, before, after);
      if (turn.replies.length !== 1) issues.push("Expected exactly one reply.");
      if (!isDeepStrictEqual(foreignBefore, workspaceProductState(foreign)) || foreign.messages.length) issues.push("Another account changed.");
      if (JSON.stringify({ after, replies: turn.replies }).includes("OUTSIDER_PRIVATE_MARKER")) issues.push("Another account's data leaked.");
      const replay = await person.send(step.message, { channel: step.channel, providerId: turn.providerId });
      if (!replay.duplicate || replay.parserCalled || replay.replies.length || !isDeepStrictEqual(workspaceProductState(after), workspaceProductState(await person.workspace()))) issues.push("Replayed ingress changed state or generated a new reply.");
      const passed = issues.length === 0;
      iterations.push({ passed, issues, turn, replay, before, after });
      process.stdout.write(`${passed ? "PASS" : "FAIL"} ${step.channel}: ${step.message}\n`);
      for (const issue of issues) process.stdout.write(`  ${issue}\n`);
    }
    const mode = scripted ? "scripted" : "live";
    const limitations = "Isolated synthetic account in temporary PGlite; SMS uses Sendblue parsing and captured delivery; web uses workspace ingestion and WebReplySender. Dashboard snapshots use the real readWorkspace repository. No HTTP authentication, rendered browser, real SMS, Google writes, worker queue execution or restart persistence tested here. Scripted output is not live AI evidence.";
    const failures = iterations.filter(row => !row.passed).length;
    const report = { mode, limitations, accountId: person.id, generatedAt: new Date().toISOString(), failures, iterations };
    await mkdir(resolve("qa"), { recursive: true });
    const base = resolve("qa", `workspace-${mode}-latest`);
    await writeFile(`${base}.json`, JSON.stringify(report, null, 2));
    await writeFile(`${base}.md`, `# Workspace journey (${mode})\n\n${limitations}\n\n${iterations.length} turns; ${failures} failures. AI quality score: ${scripted ? "unrated (fixtures)" : "requires human transcript review"}.\n\n` + iterations.map((row, i) => `## ${i + 1}. ${row.passed ? "PASS" : "FAIL"} · ${row.turn.channel}\n\n${row.turn.input}\n\n${row.turn.replies.map(reply => `> ${reply.replaceAll("\n", "\n> ")}`).join("\n")}\n\nTools: ${row.turn.tools.join(", ") || "none"}. ${row.turn.elapsedMs}ms.\n\nDashboard: ${row.after.tasks.length} tasks, ${row.after.goals.length} goals, ${row.after.items.length} life items. Full before/after values in JSON.\n`).join("\n"));
    process.stdout.write(`Saved ${base}.md and .json.\n`);
    if (failures) process.exitCode = 1;
  } finally { await simulation.close(); }
}
main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error && error.message.startsWith("Live workspace") ? `${error.message}\n` : "Workspace journey failed. No production data was used.\n");
  process.exitCode = 1;
});
