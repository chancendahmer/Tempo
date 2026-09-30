import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { AnthropicTaskIntentParser } from "../src/server/adapters/llm/task-intent-parser";
import { mutateWorkspace } from "../src/server/db/repositories/workspace-repository";
import { createAssistantSimulator } from "./lib/assistant-simulator";
import { evaluateWorkspaceChange, workspaceProductState } from "./lib/workspace-evaluation";
import { scriptedWeekParser, weekJourney } from "./lib/week-journey";
import { workspaceJourney } from "./lib/workspace-journey";
import { indirectWeekJourney } from "./lib/indirect-week-journey";

function providerFallbackKind(replies: string[]): "permanent" | "transient" | undefined {
  if (replies.some(reply => /^I can’t help with that just now because Tempo’s AI connection needs to be restored\./i.test(reply))) return "permanent";
  if (replies.some(reply => /^I’m having trouble reaching my AI service right now\./i.test(reply))) return "transient";
  return undefined;
}

async function main() {
  const scripted = process.argv.includes("--scripted");
  const indirect = process.argv.includes("--indirect");
  if (scripted && indirect) throw new Error("Indirect journey requires live model calls; no scripted answers are supplied.");
  const journey = indirect ? indirectWeekJourney : weekJourney;
  if (!scripted && (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_MODEL)) throw new Error("Live week journey requires ANTHROPIC_API_KEY and ANTHROPIC_MODEL in the process environment. No calls were made.");
  const simulation = await createAssistantSimulator(scripted ? scriptedWeekParser : new AnthropicTaskIntentParser());
  simulation.setTime(new Date("2027-01-14T15:00:00Z"));
  try {
    const person = await simulation.user();
    const outsider = await simulation.user();
    await mutateWorkspace(outsider.id, { action: "save", id: randomUUID(), version: 0, data: { kind: "note", title: "OUTSIDER_PRIVATE_MARKER", body: "Must not enter the demo account context or replies." } }, simulation.database);
    const foreignBefore = workspaceProductState(await outsider.workspace());
    const foreignMemoryBefore = (await outsider.state()).memories;
    const iterations = [];
    let permanentProviderFailure = false;
    let lastWorkspace = await person.workspace();
    const simulatedDays: Record<string, string> = { Monday: "2027-01-11", Tuesday: "2027-01-12", Wednesday: "2027-01-13", Thursday: "2027-01-14", Friday: "2027-01-15", Saturday: "2027-01-16", Sunday: "2027-01-17" };
    for (const [index, step] of journey.entries()) {
      simulation.setTime(new Date(`${simulatedDays[step.day]}T17:00:${String(index % 60).padStart(2, "0")}Z`));
      const before = await person.workspace();
      const rawBefore = await person.state();
      const turn = await person.send(step.message, { channel: step.channel });
      const writesAfter = structuredClone(simulation.calendarWrites);
      const after = await person.workspace();
      const foreign = await outsider.workspace();
      const issues = workspaceJourney.some(base => base.message === step.message)
        ? evaluateWorkspaceChange(step, before, after)
        : step.verify(after) ? [] : ["Requested state was not found."];
      if (step.expectation) issues.push(...await step.expectation({ before, after, turn, user: person, simulator: simulation }));
      if (turn.replies.length !== 1) issues.push("Expected exactly one reply.");
      if (!isDeepStrictEqual(foreignBefore, workspaceProductState(foreign)) || foreign.messages.length) issues.push("Another account changed.");
      if (!isDeepStrictEqual(foreignMemoryBefore, (await outsider.state()).memories)) issues.push("Another account's memory changed.");
      const rawAfter = await person.state();
      if (indirect && !isDeepStrictEqual(rawBefore.memories, rawAfter.memories)) issues.push("Unrequested durable memory mutation.");
      if (indirect && !indirectWeekJourney[index].allowedScopes.includes("reminders") && !isDeepStrictEqual(rawBefore.reminders, rawAfter.reminders)) issues.push("Unrequested reminder mutation outside the dashboard date window.");
      if (JSON.stringify({ after, replies: turn.replies }).includes("OUTSIDER_PRIVATE_MARKER")) issues.push("Another account's data leaked.");
      const providerFallback = providerFallbackKind(turn.replies);
      if (providerFallback) issues.push(`AI provider ${providerFallback} fallback occurred; assistant behavior was not evaluated.`);
      const replay = await person.send(step.message, { channel: step.channel, providerId: turn.providerId });
      if (!replay.duplicate || replay.parserCalled || replay.replies.length || !isDeepStrictEqual(workspaceProductState(after), workspaceProductState(await person.workspace()))) issues.push("Replayed ingress changed state or generated a new reply.");
      if (!isDeepStrictEqual(writesAfter, simulation.calendarWrites)) issues.push("Replayed ingress repeated a calendar write.");
      const rawReplay = await person.state();
      if (!isDeepStrictEqual(rawAfter.reminders, rawReplay.reminders) || !isDeepStrictEqual(rawAfter.memories, rawReplay.memories)) issues.push("Replayed ingress changed reminder or memory state.");
      const passed = issues.length === 0;
      iterations.push({ day: step.day, fixture: step.fixture ?? "workspace fixture", status: passed ? "passed" : "failed", passed, issues, turn, replay, before, after });
      process.stdout.write(`${passed ? "PASS" : "FAIL"} ${step.day} ${step.channel}: ${step.message}\n`);
      for (const issue of issues) process.stdout.write(`  ${issue}\n`);
      lastWorkspace = after;
      if (providerFallback === "permanent") { permanentProviderFailure = true; break; }
    }
    if (permanentProviderFailure) {
      for (const step of journey.slice(iterations.length)) {
        const turn = { input: step.message, replies: [] as string[], providerId: "", duplicate: false, parserCalled: false, tools: [] as string[], elapsedMs: 0, channel: step.channel };
        iterations.push({ day: step.day, fixture: step.fixture ?? "workspace fixture", status: "not_run", passed: false, issues: ["Not run after a permanent provider billing/configuration failure."], turn, replay: null, before: lastWorkspace, after: lastWorkspace });
        process.stdout.write(`NOT RUN ${step.day} ${step.channel}: ${step.message}\n`);
      }
    }
    const mode = scripted ? "scripted" : "live";
    const limitations = "Isolated synthetic account in temporary PGlite; captured SMS delivery; simulated calendar fixture and confirmation writes; web uses workspace ingestion. Day labels advance a virtual clock across Jan 11–17, 2027; they do not represent a wall-clock week or real elapsed time. No production DB, production SMS, Google health access, Google calendar writes, live worker queue, HTTP auth, rendered browser, or restart persistence. Scripted replies and scripted web-search wording are fixtures, not live AI evidence. Live mode sends synthetic prompts to the configured model and may incur API or search charges; score and transcript require human review.";
    const failures = iterations.filter(row => row.status === "failed").length;
    const notRun = iterations.filter(row => row.status === "not_run").length;
    const incomplete = notRun > 0;
    const report = { mode, journey: indirect ? "indirect" : "standard", limitations, accountId: person.id, generatedAt: new Date().toISOString(), plannedTurns: journey.length, executedTurns: iterations.length - notRun, failures, notRun, incomplete, iterations };
    await mkdir(resolve("qa"), { recursive: true });
    const base = resolve("qa", `week-${indirect ? "indirect-" : ""}${mode}-latest`);
    await writeFile(`${base}.json`, JSON.stringify(report, null, 2));
    await writeFile(`${base}.md`, `# Week in Tempo (${mode})\n\n${limitations}\n\n${iterations.length - notRun}/${journey.length} turns executed; ${failures} failed; ${notRun} not run. ${incomplete ? "Run incomplete after permanent provider failure." : "Run complete."} ${scripted ? "AI quality: unrated (scripted fixtures)." : "AI quality: requires human transcript rating; the runner does not assign a numeric quality score."}\n\n` + iterations.map((row, i) => `## ${i + 1}. ${row.status.toUpperCase()} · ${row.day} · ${row.turn.channel}\n\nFixture: ${row.fixture}\n\n${row.turn.input}\n\n${row.turn.replies.map(reply => `> ${reply.replaceAll("\n", "\n> ")}`).join("\n")}\n\nTools: ${row.turn.tools.join(", ") || "none"}. ${row.turn.elapsedMs}ms. Dashboard: ${row.after.tasks.length} tasks, ${row.after.goals.length} goals, ${row.after.items.length} life items, ${row.after.reminders.length} reminders. ${row.issues.join(" ")}\n`).join("\n"));
    process.stdout.write(`Saved ${base}.md and .json.\n`);
    if (failures) process.exitCode = 1;
  } finally { await simulation.close(); }
}
main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error && /^(Live week journey|Indirect journey)/.test(error.message) ? `${error.message}\n` : "Week journey failed. No production data was used.\n");
  process.exitCode = 1;
});
