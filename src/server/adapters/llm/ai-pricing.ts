import { createHash } from "node:crypto";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";
import { requireEnv } from "../../config/env";
import { aiBudgetPolicySchema, aiBudgetUsageSchema } from "../../domain/ai-budget";
import type { PaidAdmissionEnvelope } from "./paid-invocation";

/** Reviewed official list prices and request bounds, not a currency conversion or invoice guarantee. */
export const AI_PRICE_VERSION = "anthropic-standard-2026-10-22-v1";
export const AI_PRICE_VALID_UNTIL = "2026-11-22T00:00:00Z";
// Hundredths of a USD microdollar per token. All rates and balances are integers.
const prices = {
  "claude-haiku-4-5-20251001": { input: 100, output: 500, write5m: 125, write1h: 200, read: 10 },
  "claude-sonnet-4-5-20250929": { input: 300, output: 1500, write5m: 375, write1h: 600, read: 30 },
} as const;
type Model = keyof typeof prices;
type BudgetConfig = {
  AI_BUDGET_PRICE_VERSION?: string;
  AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS?: string;
  AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS?: string;
  AI_BUDGET_GLOBAL_DAILY_CALLS?: string;
  AI_BUDGET_ACCOUNT_DAILY_CALLS?: string;
};
export type AdmissionEnvelope = PaidAdmissionEnvelope & {
  model: Model;
  inputBound: number;
  outputBound: number;
  searchBound: number;
};
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unsupported AI pricing input");
  return value as Record<string, unknown>;
};
function knownKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error("Unpriced AI option");
}
function configuredInteger(value: string | undefined) {
  if (value === undefined || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("Invalid AI budget policy");
  return integer.parse(Number(value));
}
function cacheControl(value: unknown) {
  if (value == null) return;
  z.object({ type: z.literal("ephemeral"), ttl: z.enum(["5m", "1h"]).optional() }).strict().parse(value);
}
// Input text/tool arguments are data. Validate the billing-affecting block envelope,
// without interpreting arbitrary text or tool input as options.
function validateBlocks(value: unknown) {
  if (typeof value === "string") return;
  if (!Array.isArray(value)) throw new Error("Unsupported AI content");
  for (const raw of value) {
    const block = object(raw);
    switch (block.type) {
      case "text": knownKeys(block, ["type", "text", "cache_control", "citations"]); break;
      case "tool_use": knownKeys(block, ["type", "id", "name", "input", "cache_control", "caller"]); break;
      case "tool_result":
        knownKeys(block, ["type", "tool_use_id", "content", "is_error", "cache_control"]);
        if (block.content !== undefined) validateBlocks(block.content);
        break;
      case "server_tool_use":
        knownKeys(block, ["type", "id", "name", "input", "caller", "cache_control"]);
        if (block.name !== "web_search") throw new Error("Unpriced server tool");
        break;
      case "web_search_tool_result": knownKeys(block, ["type", "tool_use_id", "content", "cache_control"]); break;
      default: throw new Error("Unpriced content type");
    }
    cacheControl(block.cache_control);
    if (block.caller != null) z.object({ type: z.literal("direct") }).strict().parse(block.caller);
  }
}

export function buildAdmissionEnvelope(request: MessageCreateParamsNonStreaming, now: Date, config: BudgetConfig = requireEnv([])): AdmissionEnvelope {
  if (!Number.isFinite(now.getTime()) || now < new Date("2026-10-22T00:00:00Z") || now >= new Date(AI_PRICE_VALID_UNTIL) || config.AI_BUDGET_PRICE_VERSION !== AI_PRICE_VERSION) throw new Error("AI price review required");
  const raw = object(request);
  knownKeys(raw, ["model", "messages", "max_tokens", "system", "tools", "tool_choice", "temperature", "top_p", "top_k", "stop_sequences", "stream", "service_tier"]);
  if (!Object.hasOwn(prices, request.model) || (raw.stream !== undefined && raw.stream !== false) || (raw.service_tier !== undefined && raw.service_tier !== "standard_only")) throw new Error("Unpriced AI model or service tier");
  const maxOutput = z.number().int().min(1).max(64000).parse(request.max_tokens);
  if (request.system !== undefined) validateBlocks(request.system);
  for (const message of request.messages) {
    knownKeys(object(message), ["role", "content"]);
    validateBlocks(message.content);
  }
  let searchBound = 0;
  for (const rawTool of request.tools ?? []) {
    const tool = object(rawTool);
    if (tool.type === "web_search_20250305") {
      if (searchBound) throw new Error("Duplicate search tool");
      knownKeys(tool, ["type", "name", "max_uses", "allowed_domains", "blocked_domains", "user_location", "cache_control"]);
      if (tool.name !== "web_search") throw new Error("Invalid search tool");
      searchBound = z.number().int().min(1).max(2).parse(tool.max_uses);
    } else {
      knownKeys(tool, ["name", "description", "input_schema", "strict", "cache_control", "type"]);
      if (tool.type !== undefined && tool.type !== "custom") throw new Error("Unpriced tool");
    }
    cacheControl(tool.cache_control);
  }
  const model = request.model as Model;
  const policy = aiBudgetPolicySchema.parse({
    globalDailyMicrodollars: configuredInteger(config.AI_BUDGET_GLOBAL_DAILY_MICRODOLLARS),
    accountDailyMicrodollars: configuredInteger(config.AI_BUDGET_ACCOUNT_DAILY_MICRODOLLARS),
    globalDailyCalls: configuredInteger(config.AI_BUDGET_GLOBAL_DAILY_CALLS),
    accountDailyCalls: configuredInteger(config.AI_BUDGET_ACCOUNT_DAILY_CALLS),
  });
  // Full 200K model context per server sampling iteration. max_uses limits
  // searches, NOT sampling iterations. Provider pause_turn ceiling is ten.
  // No long-context beta, compaction, dynamic filtering, media or thinking mode.
  const iterations = searchBound ? 10 : 1;
  const inputBound = 200000 * iterations;
  const outputBound = maxOutput * iterations;
  // Reserve worst cache write price for every input token; settle actual buckets.
  const rate = prices[model];
  const reservedMicrodollars = inputBound * rate.write1h / 100 + outputBound * rate.output / 100 + searchBound * 10000;
  return {
    model, priceVersion: AI_PRICE_VERSION, policyVersion: `v1-${createHash("sha256").update(JSON.stringify(policy)).digest("hex")}`,
    policy, reservedMicrodollars: integer.parse(reservedMicrodollars), inputBound, outputBound, searchBound,
  };
}

export function priceUsage(envelope: AdmissionEnvelope, rawUsage: unknown, responseModel: string) {
  if (responseModel !== envelope.model || envelope.priceVersion !== AI_PRICE_VERSION) throw new Error("Unpriced response model");
  const raw = object(rawUsage);
  if (!("cache_creation_input_tokens" in raw) || !("cache_read_input_tokens" in raw)) throw new Error("Missing cache usage");
  knownKeys(raw, ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "cache_creation", "server_tool_use", "service_tier", "inference_geo", "output_tokens_details"]);
  if (raw.service_tier != null && raw.service_tier !== "standard") throw new Error("Unpriced response tier");
  if (raw.inference_geo != null && raw.inference_geo !== "global" && raw.inference_geo !== "not_available") throw new Error("Unpriced inference region");
  // Inclusive output total is authoritative; subcategories are not added again.
  if (raw.output_tokens_details != null) {
    const details = object(raw.output_tokens_details);
    knownKeys(details, ["text_tokens", "thinking_tokens"]);
    for (const value of Object.values(details)) integer.parse(value);
  }
  const cacheTotal = integer.parse(raw.cache_creation_input_tokens ?? 0);
  const read = integer.parse(raw.cache_read_input_tokens ?? 0);
  let five = 0, hour = 0, searches = 0;
  if (raw.cache_creation != null) {
    const cache = object(raw.cache_creation);
    knownKeys(cache, ["ephemeral_5m_input_tokens", "ephemeral_1h_input_tokens"]);
    five = integer.parse(cache.ephemeral_5m_input_tokens);
    hour = integer.parse(cache.ephemeral_1h_input_tokens);
  } else if (cacheTotal) throw new Error("Missing cache cost breakdown");
  if (raw.server_tool_use != null) {
    const server = object(raw.server_tool_use);
    knownKeys(server, ["web_search_requests", "web_fetch_requests"]);
    searches = integer.parse(server.web_search_requests);
    if (integer.parse(server.web_fetch_requests ?? 0) !== 0) throw new Error("Unpriced fetch usage");
  } else if (envelope.searchBound) throw new Error("Missing search usage");
  const usage = aiBudgetUsageSchema.parse({ inputTokens: integer.parse(raw.input_tokens), outputTokens: integer.parse(raw.output_tokens), cacheCreationInputTokens: cacheTotal, cacheReadInputTokens: read, cacheCreation5mInputTokens: five, cacheCreation1hInputTokens: hour, webSearchRequests: searches });
  // Rates scaled by 100 are integer microcents. Round UP once to a microdollar.
  const rate = prices[envelope.model];
  const hundredths = BigInt(usage.inputTokens) * BigInt(rate.input) + BigInt(usage.outputTokens) * BigInt(rate.output)
    + BigInt(five) * BigInt(rate.write5m) + BigInt(hour) * BigInt(rate.write1h) + BigInt(read) * BigInt(rate.read)
    + BigInt(searches) * BigInt(1000000);
  const actualMicrodollars = integer.parse(Number((hundredths + BigInt(99)) / BigInt(100)));
  // An unexpected but priceable overage must reach settlement so it halts all
  // later admission. Never clamp billed usage to the original reservation.
  const haltAdmission = BigInt(usage.inputTokens) + BigInt(cacheTotal) + BigInt(read) > BigInt(envelope.inputBound)
    || usage.outputTokens > envelope.outputBound || searches > envelope.searchBound;
  return { actualMicrodollars, usage, haltAdmission };
}
