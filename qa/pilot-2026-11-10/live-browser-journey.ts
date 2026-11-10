import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { assertOrdinaryRundownRequest, isRundownPhase, liveBrowserSteps, reportsCurrentNutrition, reportsLibraryMemoryAbsent, rundownReplyReview, type LiveBrowserPhase, type LiveTool } from "./live-browser-steps";
import { withLiveQaBudget } from "./live-budget";
import { localDay } from "../../src/server/domain/life-items";
import { getServerEnv, resetEnvCacheForTests } from "../../src/server/config/env";
import type { TaskIntentParser, ToolRejection } from "../../src/server/adapters/llm/task-intent-parser";
import type { LiveBrowserObservation } from "./account-bridge";
import type { TurnAuthorization } from "../../src/server/domain/turn-write-policy";

const isPhase = (value: string | undefined): value is LiveBrowserPhase => !!value && Object.hasOwn(liveBrowserSteps, value);
const directory = "qa/pilot-2026-11-10/private/live-transcripts";
// Full model input context plus the parser's 1,400-token output limit. The
// central journal independently enforces this reservation for each request.
const models = {
  sonnet: { id: "claude-sonnet-4-6", rundownReservation: 3_021_000 },
  haiku: { id: "claude-haiku-4-5-20251001", rundownReservation: 207_000 },
} as const;

async function main() {
  const [mode, first, second, ...options] = process.argv.slice(2);
  if (mode === "prompt" && isPhase(first) && !second) {
    console.log(liveBrowserSteps[first].message);
    return;
  }
  if (mode === "preflight" && isPhase(first) && !second) {
    const date = localDay(new Date(), "America/New_York");
    const { preflightLiveBrowserTurn } = await import("./account-bridge");
    const proof = await preflightLiveBrowserTurn(first, date);
    console.log(JSON.stringify({ phase: first, date, fixtureReady: true, modelRequests: 0, ...proof }));
    return;
  }
  const [maybeChannel] = options;
  const channelArg = maybeChannel === "sms" || maybeChannel === "web" ? maybeChannel : undefined;
  if (channelArg) options.shift();
  const [modelFlag, modelArg] = options;
  const invalidModel = options.length > 0 && (options.length !== 2 || modelFlag !== "--model" || (modelArg !== "haiku" && modelArg !== "sonnet"));
  if (mode !== "run" || !first || first.startsWith("-") || !isPhase(second) || invalidModel ||
    (second === "rundown-release" && modelArg === "haiku") ||
    (channelArg === "web" && (second === "log" || second === "correct")) ||
    (channelArg === "sms" && (isRundownPhase(second) || second.startsWith("memory-")))) throw Error("Use prompt <phase>, preflight <phase>, or run <runtime-directory> <log|correct|advice|memory-save|memory-recall|rundown|rundown-recheck|rundown-final|rundown-confirm|rundown-release> [sms|web] [--model haiku|sonnet].");

  const runtime = first;
  const phase = second;
  const releaseRundown = phase === "rundown-release";
  const model = modelArg === "haiku" ? models.haiku : models.sonnet;
  const channel = channelArg ?? (isRundownPhase(phase) || phase.startsWith("memory-") ? "web" : "sms");
  if (!(await stat(runtime)).isDirectory()) throw Error("The configured runtime directory is required.");
  const nativeFetch = globalThis.fetch;
  loadEnvConfig(runtime, true, { info() {}, error() {} });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw Error("Configured runtime key unavailable.");
  const { runLiveBrowserTurn } = await import("./account-bridge");
  const fixtureFetch = globalThis.fetch;
  for (const name of Object.keys(process.env).filter(name => /^(ANTHROPIC_|.*PROXY$)/i.test(name))) delete process.env[name];
  Object.assign(process.env, {
    ANTHROPIC_API_KEY: apiKey, ANTHROPIC_MODEL: model.id, ANTHROPIC_LOG: "off",
    AI_BUDGET_MODE: "off", ASSISTANT_WEB_SEARCH_ENABLED: String(releaseRundown),
    AUTONOMOUS_SENDING_ENABLED: "false", INTERVENTION_SHADOW_MODE: "true",
  });
  // The fixture logger initialized the cache while no provider key was present.
  resetEnvCacheForTests();
  const configured = getServerEnv();
  if (configured.ANTHROPIC_API_KEY !== apiKey || configured.ANTHROPIC_MODEL !== model.id ||
    configured.ASSISTANT_WEB_SEARCH_ENABLED !== releaseRundown || configured.AUTONOMOUS_SENDING_ENABLED || configured.SENDBLUE_API_KEY ||
    configured.LINQ_API_KEY || configured.TWILIO_ACCOUNT_SID || configured.GOOGLE_CLIENT_ID) throw Error("Live fixture provider isolation failed.");

  const file = `${directory}/pg-${randomUUID()}.json`;
  await mkdir(directory, { recursive: true });
  globalThis.fetch = nativeFetch;
  try {
    await withLiveQaBudget(async budget => {
      const opening = budget.snapshot();
      if (opening.halted || opening.pending || !opening.reviewedContinuation ||
        opening.externalCarrierHoldMicrodollars !== 1_000_000 || opening.outstandingMicrodollars < 3_021_000) {
        throw Error("The existing reviewed QA budget and retained debt are required.");
      }
      if (isRundownPhase(phase) && opening.capMicrodollars - opening.committedMicrodollars < model.rundownReservation) {
        throw Error("The reviewed cap has no room for the next rundown reservation.");
      }
      const { AnthropicTaskIntentParser } = await import("../../src/server/adapters/llm/task-intent-parser");
      const real = new AnthropicTaskIntentParser();
      const authorizations: TurnAuthorization[] = [];
      const toolRejections: ToolRejection[] = [];
      // Only this isolated two-account fixture persists raw rejected quotes, in its private transcript.
      const rejectedToolQuotes: Array<{ tool: string; sourceQuote: string | null; iteration: number }> = [];
      const observation: LiveBrowserObservation = {};
      const parser: TaskIntentParser = {
        parse: input => real.parse({ ...input, onToolRejection: rejection => toolRejections.push(rejection),
          onRejectedToolQuote: rejection => rejectedToolQuotes.push(rejection) }),
        authorizer: { authorize: async input => {
          const decision = await real.authorizer.authorize(input);
          authorizations.push(decision);
          return decision;
        } },
      };
      const now = new Date();
      const date = localDay(now, "America/New_York");
      const tools: LiveTool[] = [];
      let result: Awaited<ReturnType<typeof runLiveBrowserTurn>> | undefined;
      let failure: { category: string; location?: string } | undefined;
      const ordinaryRequests = { searchToolOfferedRequests: 0, blockedNonOrdinaryRequests: 0 };
      const guardedFetch = globalThis.fetch;
      if (releaseRundown) globalThis.fetch = async (resource, init) => {
        const request = new Request(resource, init);
        if (request.url === "https://api.anthropic.com/v1/messages") {
          try {
            assertOrdinaryRundownRequest(await request.clone().json());
            ordinaryRequests.searchToolOfferedRequests += 1;
          } catch {
            ordinaryRequests.blockedNonOrdinaryRequests += 1;
            throw Error("The release rundown refused a non-ordinary model request.");
          }
        }
        return guardedFetch(request);
      };
      try {
        result = await runLiveBrowserTurn(phase, channel, parser, now, date, tools, () => budget.snapshot().attempts, observation);
        const expected = phase === "log" ? "life_save" : phase === "correct" ? "life_patch" : phase === "memory-save" ? "remember_memory" : undefined;
        if (expected && !authorizations.some(decision => decision.mode === "write" && decision.commands.length === 1 && decision.commands[0] === expected)) {
          throw Error("The expected independent authorization was not observed.");
        }
        if (!expected && authorizations.some(decision => decision.mode === "write")) throw Error("Advice unexpectedly received write authorization.");
        if (phase === "advice" && !reportsCurrentNutrition(result.reply ?? "")) throw Error("Advice reply misstated or omitted the verified current nutrition amounts.");
        if (phase === "memory-recall" && !reportsLibraryMemoryAbsent(result.reply ?? "")) throw Error("Recall reply did not distinguish the absent saved memory.");
      } catch (error) {
        failure = {
          category: error instanceof Error ? error.name : "unknown",
          location: error instanceof Error ? error.stack?.match(/(?:live-browser-(?:journey|steps)|account-bridge)\.ts:\d+:\d+/)?.[0] : undefined,
        };
      } finally {
        if (releaseRundown) globalThis.fetch = guardedFetch;
      }
      const closing = budget.snapshot();
      const accountingPassed = closing.attempts > opening.attempts && !closing.halted && !closing.pending
        && closing.uncertain === opening.uncertain && closing.outstandingMicrodollars === opening.outstandingMicrodollars;
      if (!accountingPassed) failure ??= { category: "LiveAccountingIncomplete" };
      if (releaseRundown && (ordinaryRequests.searchToolOfferedRequests !== closing.attempts - opening.attempts ||
        ordinaryRequests.searchToolOfferedRequests === 0 || ordinaryRequests.blockedNonOrdinaryRequests || toolRejections.length)) {
        failure ??= { category: "OrdinaryRundownRequestMismatch" };
      }
      const manualReview = isRundownPhase(phase) && !failure ? rundownReplyReview : undefined;
      await writeFile(file, JSON.stringify({
        evidence: "Live Anthropic parser and independent authorizer when invoked, local PostgreSQL fixture, captured SMS, no carrier",
        phase, channel, date, model: model.id, authorizations, tools, toolRejections, rejectedToolQuotes, observation, result, failure, accountingPassed, budget: closing,
        ...(releaseRundown ? { ordinaryRequests } : {}),
        ...(manualReview ? { automatedChecksPassed: true, replyReviewRequired: manualReview } : {}),
      }, null, 2), { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({
        phase, channel, date, model: model.id, passed: manualReview ? null : !failure, transcript: file, failure, accountingPassed,
        ...(releaseRundown ? { ordinaryRequests } : {}),
        ...(manualReview ? { automatedChecksPassed: true, replyReviewRequired: manualReview } : {}),
        authorizations: authorizations.length, tools: tools.map(tool => tool.command.type), toolRejections, budget: closing,
      }));
      if (failure) process.exitCode = 1;
    });
  } finally {
    globalThis.fetch = fixtureFetch;
    delete process.env.ANTHROPIC_API_KEY;
    resetEnvCacheForTests();
  }
}

void main().catch(error => {
  console.error(JSON.stringify({ run: "stopped", category: error instanceof Error ? error.name : "unknown" }));
  process.exitCode = 1;
});
