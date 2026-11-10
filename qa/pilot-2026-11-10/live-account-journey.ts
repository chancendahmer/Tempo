import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Workspace } from "../../scripts/lib/workspace-journey";
import { withLiveQaBudget } from "./live-budget";

async function main() {
  const [runtime, mode = "--canary", ...extra] = process.argv.slice(2);
  if (!runtime || runtime.startsWith("-") || extra.length || !["--canary", "--full", "--recall"].includes(mode)) throw Error("Provide the existing runtime directory and --canary, --full or --recall");
  loadEnvConfig(runtime, true, { info() {}, error() {} });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw Error("Configured runtime key unavailable");
  const { serverEnvSchema } = await import("../../src/server/config/env");
  const sdkEnv = Object.keys(process.env).filter(name => /^(ANTHROPIC_|PG)/i.test(name));
  for (const name of [...Object.keys(serverEnvSchema.shape), ...sdkEnv]) delete process.env[name];
  Object.assign(process.env, {
    NODE_ENV: "test", ANTHROPIC_API_KEY: key, ANTHROPIC_MODEL: "claude-sonnet-4-6",
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    APP_BASE_URL: "http://localhost:3103", LOG_LEVEL: "silent", ANTHROPIC_LOG: "off",
    AI_BUDGET_MODE: "off", ASSISTANT_WEB_SEARCH_ENABLED: "false",
    AUTONOMOUS_SENDING_ENABLED: "false", INTERVENTION_SHADOW_MODE: "true",
  });
  const directory = "qa/pilot-2026-11-10/private/live-transcripts";
  await mkdir(directory, { recursive: true });
  await withLiveQaBudget(async budget => {
    const { AnthropicTaskIntentParser } = await import("../../src/server/adapters/llm/task-intent-parser");
    const { createAssistantSimulator } = await import("../../scripts/lib/assistant-simulator");
    const { workspaceProductState } = await import("../../scripts/lib/workspace-evaluation");
    const { mutateWorkspace } = await import("../../src/server/db/repositories/workspace-repository");
    const sim = await createAssistantSimulator(new AnthropicTaskIntentParser());
    const durable = (workspace: Workspace) => ({
      ...workspaceProductState(workspace), memories: workspace.memories, preferences: workspace.homePreferences, setup: workspace.setup,
    });
    const records: unknown[] = [];
    const runId = randomUUID();
    try {
      sim.setTime(new Date("2026-11-10T18:00:00Z"));
      const person = await sim.user(), other = await sim.user();
      await mutateWorkspace(other.id, { action: "save", id: randomUUID(), version: 0, data: { kind: "note", title: "PRIVATE OTHER ACCOUNT", body: "A foreign account marker that must never be returned." } }, sim.database);
      const otherSnapshot = async () => {
        const workspace = await other.workspace();
        return JSON.stringify({ ...durable(workspace), messages: workspace.messages });
      };
      const thoughtTitle = "Studio questions";
      const thoughtBody = "Ask about Saturday beginner classes";
      const canaryTime = "2026-11-12T19:00:00.000Z";
      const steps = [
        { text: `Save a thought titled "${thoughtTitle}" with the note "${thoughtBody}" and remind me about it on November 12, 2026 at 2 PM New York time.`, expect: "thought-reminder" },
        { text: "Actually move that reminder to 5 PM the same day.", expect: "move-reminder" },
        { text: "Add oats and yogurt to my grocery list. No reminder.", expect: "groceries" },
        { text: "Log my lunch today: bean salad, 400 calories and 20 grams of protein. Other nutrients are unknown.", expect: "food" },
        { text: "How much protein have I logged today? Advice only, don't change anything.", expect: "read", readOnly: true },
        { text: "Save my evening routine at 9 PM: wash my face for 3 minutes and pack my bag for 2 minutes.", expect: "routine" },
        { text: "Put packing my bag first in that routine, keep everything else the same.", expect: "routine-order" },
        { text: "Please delete the Studio questions thought. Keep its reminder.", expect: "delete-note" },
        { text: "What did I save about studio questions? Don't recreate it.", expect: "read", readOnly: true },
      ];
      const selectedSteps = mode === "--recall" ? [steps[0], steps[7], steps[8]] : steps;
      for (const [index, step] of selectedSteps.entries()) {
        if (mode === "--canary" && index > 0) break;
        if (mode === "--recall" && index === 2) {
          const existing = (await person.state()).reminders;
          if (existing.length !== 1) throw Error("Expected one owned reminder before dashboard cancellation");
          await mutateWorkspace(person.id, { action: "remove_reminder", id: existing[0].id }, sim.database);
        }
        const before = await person.workspace();
        const otherBefore = await otherSnapshot();
        const turn = await person.send(step.text, { channel: index % 2 ? "web" : "sms" });
        const after = await person.workspace(), state = await person.state();
        const issues: string[] = [];
        if (turn.replies.length !== 1 || !turn.replies[0]?.trim()) issues.push("Expected exactly one nonempty reply");
        if (step.readOnly && JSON.stringify(durable(before)) !== JSON.stringify(durable(after))) issues.push("Read-only request changed workspace");
        if (otherBefore !== await otherSnapshot()) issues.push("Other account changed");
        if (turn.replies.join(" ").includes("PRIVATE OTHER ACCOUNT")) issues.push("Foreign account marker disclosed");
        if (step.expect === "thought-reminder") {
          const [note] = after.items.filter(item => item.data.kind === "note");
          const [reminder] = state.reminders;
          if (after.items.length !== 1 || note?.data.kind !== "note" || note.data.title !== thoughtTitle || note.data.body !== thoughtBody) issues.push("Exact canary thought was not saved once");
          if (state.reminders.length !== 1 || reminder.status !== "scheduled" || reminder.text !== thoughtTitle || reminder.remindAt.toISOString() !== canaryTime ||
            reminder.timezone !== "America/New_York" || reminder.sourceMessageId !== note?.id) issues.push("Exact canary reminder, time zone, or capture identity was incorrect");
          if (after.tasks.length || after.goals.length) issues.push("Compound capture added an unintended task or goal");
        }
        if (step.expect === "move-reminder" && (state.reminders.filter(row => row.status === "scheduled").length !== 1 || !state.reminders.some(row => row.remindAt.toISOString() === "2026-11-12T22:00:00.000Z"))) issues.push("Reminder move incorrect or duplicated");
        if (step.expect === "groceries" && !["oats", "yogurt"].every(term => after.items.some(item => item.data.kind === "grocery" && item.data.title.toLowerCase().includes(term)))) issues.push("Requested groceries missing");
        if (step.expect === "food" && !after.items.some(item => item.data.kind === "food" && item.data.date === "2026-11-10" && item.data.calories === 400 && item.data.protein === 20 && item.data.carbs === null)) issues.push("Food log incorrect");
        if (step.expect === "routine" && !after.items.some(item => item.data.kind === "routine" && item.data.time === "21:00" && item.data.steps.length === 2)) issues.push("Routine missing or incorrect");
        if (step.expect === "routine-order" && !after.items.some(item => item.data.kind === "routine" && /pack/i.test(item.data.steps[0]?.title ?? "") && item.data.steps.length === 2 && item.data.time === "21:00")) issues.push("Routine reorder did not preserve content");
        if (step.expect === "delete-note" && (after.items.some(item => item.data.kind === "note" && /studio/i.test(item.data.title)) || state.reminders.filter(row => row.status === "scheduled").length !== 1)) issues.push("Scoped deletion incorrect");
        if (mode === "--recall" && index === 2 && (state.reminders.length !== 1 || state.reminders[0].status !== "cancelled")) issues.push("Read after dashboard cancellation changed reminder status");
        const attemptsBeforeReplay = budget.snapshot().attempts;
        const replay = await person.send(step.text, { channel: index % 2 ? "web" : "sms", providerId: turn.providerId });
        if (!replay.duplicate || replay.replies.length || budget.snapshot().attempts !== attemptsBeforeReplay) issues.push("Duplicate ingress replied or attempted another paid request");
        if (JSON.stringify(durable(after)) !== JSON.stringify(durable(await person.workspace()))) issues.push("Duplicate ingress mutated records");
        if (otherBefore !== await otherSnapshot()) issues.push("Other account changed after replay");
        records.push({ index, ...turn, issues, after, reminders: state.reminders });
        await writeFile(`${directory}/${runId}.json`, JSON.stringify({ evidence: "Real model; isolated PGlite; captured SMS and fixture Calendar, no carrier delivery", records, budget: budget.snapshot() }, null, 2));
        console.log(JSON.stringify({ index, expectation: step.expect, replyCount: turn.replies.length, replayReplyCount: replay.replies.length, tools: turn.tools, issues, budget: budget.snapshot() }));
        if (issues.length) process.exitCode = 1;
        if (budget.snapshot().halted) break;
      }
    } finally { await sim.close(); console.log(JSON.stringify({ runId, budget: budget.snapshot() })); }
  });
}
main().catch(error => { console.error(JSON.stringify({ run: "stopped", category: error instanceof Error ? error.name : "unknown" })); process.exitCode = 1; });
