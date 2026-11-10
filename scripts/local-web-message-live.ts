import { loadEnvConfig } from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withLiveQaBudget } from "./lib/live-qa-budget";
import { assertLocalQaDatabase, reminderProbeExpectationSchema, runLocalWebMessageProbe } from "./lib/local-web-message-probe";

// Normal application credential loading; never print environment/provider errors.
loadEnvConfig(process.env.TEMPO_TEST_ENV_DIR ?? process.cwd(), false, { info() {}, error() {} });
process.env.ASSISTANT_WEB_SEARCH_ENABLED = "false";
const argument = (name: string) => { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith("--")) throw Error("Missing probe argument"); return process.argv[index + 1]; };
const optionalArgument = (name: string) => process.argv.includes(name) ? argument(name) : undefined;

async function main() {
  if (!process.argv.includes("--synthetic-account")) throw Error("Synthetic account acknowledgement required");
  const connectionString = process.env.DATABASE_URL ?? "";
  assertLocalQaDatabase(connectionString);
  const userId = argument("--user-id"), messageId = argument("--message-id"), expectedNoteTitle = optionalArgument("--expect-note-title"), reminderText = optionalArgument("--expect-reminder-text");
  if (!!expectedNoteTitle === !!reminderText) throw Error("Choose exactly one note or reminder expectation");
  const previousPath = optionalArgument("--previous-proof");
  const hours = optionalArgument("--expect-reminder-hours");
  if (hours && !/^\d{1,2}(,\d{1,2})*$/.test(hours)) throw Error("Use comma-separated local whole hours");
  if (expectedNoteTitle && ["--expect-reminder-count", "--expect-reminder-hours", "--expect-reminder-date", "--previous-proof"].some(flag => process.argv.includes(flag))) throw Error("Reminder flags require reminder mode");
  const expectedReminder = reminderText ? reminderProbeExpectationSchema.parse({ text: reminderText, count: Number(argument("--expect-reminder-count")),
    ...(hours ? { hours: hours.split(",").map(Number) } : {}), date: optionalArgument("--expect-reminder-date"),
    ...(previousPath ? { previous: JSON.parse(await readFile(resolve(previousPath), "utf8")) } : {}),
  }) : undefined;
  const folder = resolve(process.env.TEMPO_QA_RUN_DIR ?? "qa/daily-beta-live");
  await withLiveQaBudget(folder, Number(process.env.TEMPO_QA_CAP ?? 5), async budget => {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_MODEL !== "claude-sonnet-4-6") throw Error("Expected configured model");
    const { AnthropicTaskIntentParser } = await import("../src/server/adapters/llm/task-intent-parser");
    const authorization: Array<{ mode: string; commands: string[] }> = [];
    try {
      const report = await runLocalWebMessageProbe({ connectionString, userId, messageId, expectedNoteTitle, expectedReminder, onAuthorization: decision => authorization.push(decision) }, new AnthropicTaskIntentParser());
      await writeFile(resolve(folder, `web-message-${messageId}.json`), JSON.stringify({ ...report, budget }, null, 2));
      await writeFile(resolve(folder, "local-web-message-proof.json"), JSON.stringify({ ...report, budget }, null, 2));
      console.log(JSON.stringify({ passed: report.passed, messageId, noteId: report.note?.id, reminderIds: report.reminderProof?.reminders.map(row => row.id), scheduledReminderCount: report.reminderProof?.count, replyId: report.reply.id, budget }));
    } catch {
      await writeFile(resolve(folder, "local-web-message-proof.json"), JSON.stringify({ passed: false, messageId, userId, category: "probe_failed", authorization, budget }, null, 2));
      throw Error("Local web probe failed");
    }
  });
}
main().catch(() => { console.error("Local web probe refused or failed. Inspect the sanitized proof and shared ledger; no other queued work was selected."); process.exitCode = 1; });
