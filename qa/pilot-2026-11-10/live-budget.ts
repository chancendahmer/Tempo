/** Synthetic QA only. The fixed ledger is independent of Tempo's production accounting. */
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

const cap = 10_000_000;
const carrierAllowance = 1_000_000;
const authorization = "tempo-2026-11-10-synthetic-qa-10-usd-v1";
const directory = resolve("qa/pilot-2026-11-10/private/live-budget-10");
const endpoint = "https://api.anthropic.com/v1/messages";
export const liveQaProbePrompt = "Reply with OK.";
export const liveQaProbeMaxTokens = 16;
export const liveQaProbeModel = "claude-sonnet-4-6";
const rates = {
  "claude-sonnet-4-6": { input: 3, output: 15, inputBound: 1_000_000 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, inputBound: 200_000 },
} as const;
const model = z.enum(["claude-sonnet-4-6", "claude-haiku-4-5-20251001"]);
type Model = z.infer<typeof model>;
const count = z.number().int().min(0).max(1_000_000_000);
const maxTokens = count.min(1).max(5000);
const direct = z.object({ type: z.literal("direct") }).strict();
const textBlock = z.object({ type: z.literal("text"), text: z.string(), citations: z.null().optional() }).strict();
const content = z.union([z.string(), z.array(z.discriminatedUnion("type", [
  textBlock,
  z.object({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.record(z.string(), z.unknown()), caller: direct.optional() }).strict(),
  z.object({ type: z.literal("tool_result"), tool_use_id: z.string(), content: z.union([z.string(), z.array(textBlock)]).optional(), is_error: z.boolean().optional() }).strict(),
]))]);
const requestSchema = z.object({
  model, max_tokens: maxTokens,
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content }).strict()).min(1),
  system: z.union([z.string(), z.array(textBlock)]).optional(),
  tools: z.array(z.object({
    type: z.literal("custom").optional(), name: z.string(), description: z.string().optional(),
    input_schema: z.record(z.string(), z.unknown()), strict: z.boolean().optional(),
  }).strict()).optional(),
  tool_choice: z.object({ type: z.enum(["auto", "any", "none", "tool"]), name: z.string().optional(), disable_parallel_tool_use: z.boolean().optional() }).strict().optional(),
  temperature: z.number().optional(), top_p: z.number().optional(), top_k: z.number().optional(), stop_sequences: z.array(z.string()).optional(),
  stream: z.literal(false).optional(), service_tier: z.literal("standard_only").optional(),
}).strict();

const zero = z.literal(0).nullish();
const usageSchema = z.object({
  input_tokens: count, output_tokens: count,
  cache_creation_input_tokens: zero, cache_read_input_tokens: zero,
  cache_creation: z.object({ ephemeral_5m_input_tokens: zero, ephemeral_1h_input_tokens: zero }).strict().nullish(),
  server_tool_use: z.object({ web_search_requests: zero, web_fetch_requests: zero }).strict().nullish(),
  service_tier: z.literal("standard").nullish(),
  inference_geo: z.enum(["global", "not_available"]).nullish(),
  speed: z.literal("standard").nullish(),
  // These are a breakdown of output_tokens, already inclusive in the price.
  output_tokens_details: z.object({ text_tokens: count.nullish(), thinking_tokens: count.nullish() }).strict().nullish(),
}).strict().refine(usage => (usage.output_tokens_details?.thinking_tokens ?? 0) <= usage.output_tokens
  && (usage.output_tokens_details?.text_tokens ?? 0) <= usage.output_tokens);

const usageCounters = [
  "input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens",
  "cache_creation.ephemeral_5m_input_tokens", "cache_creation.ephemeral_1h_input_tokens",
  "server_tool_use.web_search_requests", "server_tool_use.web_fetch_requests",
  "output_tokens_details.thinking_tokens", "output_tokens_details.text_tokens",
] as const;
const fieldName = z.string().regex(/^[a-z][a-z0-9_]{0,39}(\.[a-z][a-z0-9_]{0,39})?$/)
  .refine(name => !/(^|\.)(?:sk_|x_api_key|authorization|credential)/.test(name));
const usageDiagnosticsSchema = z.object({
  fields: z.array(fieldName).max(40),
  counters: z.partialRecord(z.enum(usageCounters), count),
}).strict();

const errorType = z.enum([
  "invalid_request_error", "authentication_error", "billing_error", "permission_error", "not_found_error",
  "request_too_large", "rate_limit_error", "api_error", "overloaded_error", "unknown",
]);
const category = z.enum(["billing", "provider", "network", "invalid_usage"]);
const header = z.object({ kind: z.literal("authorization"), authorization: z.literal(authorization), cap: z.literal(cap) }).strict();
const reserveEvent = z.object({ kind: z.literal("reserve"), id: z.uuid(), at: z.iso.datetime(), model, maxTokens, reserved: count, recoveryFor: z.uuid().optional() }).strict();
const settleEvent = z.object({ kind: z.literal("settle"), id: z.uuid(), at: z.iso.datetime(), status: z.literal(200), input: count, output: count, actual: z.number().int().nonnegative().safe() }).strict();
const uncertainEvent = z.object({
  kind: z.literal("uncertain"), id: z.uuid(), at: z.iso.datetime(), status: z.number().int().min(100).max(599).nullable(),
  type: errorType, category, usageDiagnostics: usageDiagnosticsSchema.optional(),
}).strict();
const recoveryEvent = z.object({ kind: z.literal("recovery_probe"), id: z.uuid(), at: z.iso.datetime(), review: z.literal("documented_standard_response_speed") }).strict();
const continuationEvent = z.object({
  kind: z.literal("continuation_review"), id: z.uuid(), probeId: z.uuid(), at: z.iso.datetime(), review: z.literal("compatible_standard_probe_settled"),
}).strict();
const carrierEvent = z.object({
  kind: z.literal("external_allowance"), category: z.literal("demo_sms_carrier"), reserved: z.literal(carrierAllowance), at: z.iso.datetime(),
}).strict();
const event = z.discriminatedUnion("kind", [header, reserveEvent, settleEvent, uncertainEvent, recoveryEvent, continuationEvent, carrierEvent]);
type Event = z.infer<typeof event>;
type Reservation = z.infer<typeof reserveEvent>;
type Terminal = z.infer<typeof settleEvent> | z.infer<typeof uncertainEvent>;
type Attempt = { reservation: Reservation; outcome?: Terminal };
export type LiveQaBudgetSnapshot = {
  capMicrodollars: number; settledMicrodollars: number; outstandingMicrodollars: number; committedMicrodollars: number;
  externalCarrierHoldMicrodollars: number;
  attempts: number; settled: number; uncertain: number; pending: number; halted: boolean;
  recoveryProbe: "none" | "armed" | "used";
  reviewedContinuation: boolean;
};
type Budget = { snapshot: () => LiveQaBudgetSnapshot };
class GuardError extends Error {
  constructor(message: string) { super(message); this.name = "LiveQaBudgetError"; }
}
let active = false;
const cost = (name: Model, input: number, output: number) => input * rates[name].input + output * rates[name].output;
const reservationCost = (name: Model, max: number) => cost(name, rates[name].inputBound, max);
const now = () => new Date().toISOString();
const filename = (index: number) => `${String(index).padStart(6, "0")}.json`;

class Journal {
  readonly attempts = new Map<string, Attempt>();
  size = 0;
  readonly halts = new Set<string>();
  recoveryProbe?: { id: string; attemptId?: string };
  continuation?: { id: string; probeId: string };
  carrierHold = 0;
  constructor(readonly folder: string) {}

  async load() {
    const files = (await readdir(this.folder)).filter(name => name !== "run.lock").sort();
    for (const [index, name] of files.entries()) {
      if (name !== filename(index)) throw new GuardError("QA journal has an unexpected entry.");
      const record = event.parse(JSON.parse(await readFile(join(this.folder, name), "utf8")));
      this.apply(record);
    }
    if (!this.size) await this.append({ kind: "authorization", authorization, cap });
  }

  apply(record: Event) {
    if (!this.size ? record.kind !== "authorization" : record.kind === "authorization") throw new GuardError("QA journal has an invalid authorization.");
    if (record.kind === "reserve") {
      const budget = this.snapshot();
      const recovery = record.recoveryFor && this.canProbe(record.recoveryFor);
      if ((record.recoveryFor && !recovery) || (budget.halted && !recovery) || budget.committedMicrodollars + record.reserved > cap ||
        this.attempts.has(record.id) || record.reserved !== reservationCost(record.model, record.maxTokens)) {
        throw new GuardError("QA journal has an invalid reservation.");
      }
      if (recovery && this.recoveryProbe) {
        if (record.model !== liveQaProbeModel || record.maxTokens !== liveQaProbeMaxTokens) throw new GuardError("QA recovery probe envelope does not match.");
        this.recoveryProbe.attemptId = record.id;
      }
      this.attempts.set(record.id, { reservation: record });
    }
    if (record.kind === "recovery_probe") {
      if (!this.qualifiesForRecovery(record.id)) throw new GuardError("QA recovery probe has no qualifying unresolved attempt.");
      this.recoveryProbe = { id: record.id };
    }
    if (record.kind === "continuation_review") {
      if (!this.qualifiesForContinuation(record.id, record.probeId)) throw new GuardError("QA continuation has no qualifying settled probe.");
      this.continuation = { id: record.id, probeId: record.probeId };
    }
    if (record.kind === "external_allowance") {
      if (!this.canReserveCarrierAllowance()) throw new GuardError("QA carrier allowance exceeds the aggregate spending cap or is already reserved.");
      this.carrierHold = record.reserved;
    }
    if (record.kind === "settle" || record.kind === "uncertain") {
      const attempt = this.attempts.get(record.id);
      if (!attempt || attempt.outcome) throw new GuardError("QA journal has an invalid outcome.");
      const reservation = attempt.reservation;
      if (record.kind === "settle" && record.actual !== cost(reservation.model, record.input, record.output)) throw new GuardError("QA journal has invalid token accounting.");
      if (record.kind === "settle" ? record.input > rates[reservation.model].inputBound || record.output > reservation.maxTokens : record.category === "billing" || record.category === "invalid_usage") this.halts.add(record.id);
      attempt.outcome = record;
    }
    this.size++;
  }

  canReserveCarrierAllowance() {
    const budget = this.snapshot();
    return !this.carrierHold && !budget.halted && budget.committedMicrodollars + carrierAllowance <= cap;
  }

  qualifiesForRecovery(priorId: string) {
    const prior = this.attempts.get(priorId);
    const outcome = prior?.outcome;
    return !this.recoveryProbe && this.halts.size === 1 && this.halts.has(priorId) && !this.snapshot().pending &&
      prior?.reservation.model === liveQaProbeModel && outcome?.kind === "uncertain" && outcome.status === 200 && outcome.category === "invalid_usage";
  }

  canProbe(priorId: string) {
    return this.recoveryProbe?.id === priorId && !this.recoveryProbe.attemptId && this.halts.size === 1 && this.halts.has(priorId);
  }

  qualifiesForContinuation(priorId: string, probeId: string) {
    const probe = this.attempts.get(probeId);
    return !this.continuation && this.recoveryProbe?.id === priorId && this.recoveryProbe.attemptId === probeId &&
      this.halts.size === 1 && this.halts.has(priorId) && !this.snapshot().pending &&
      probe?.reservation.recoveryFor === priorId && probe.reservation.model === liveQaProbeModel &&
      probe.reservation.maxTokens === liveQaProbeMaxTokens && probe.outcome?.kind === "settle";
  }

  snapshot(): LiveQaBudgetSnapshot {
    let settledMicrodollars = 0, outstandingMicrodollars = 0, settled = 0, uncertain = 0, pending = 0;
    for (const { reservation, outcome } of this.attempts.values()) {
      if (outcome?.kind === "settle") { settled++; settledMicrodollars += outcome.actual; }
      else {
        outstandingMicrodollars += reservation.reserved;
        if (outcome) uncertain++;
        else pending++;
      }
    }
    return { capMicrodollars: cap, settledMicrodollars, outstandingMicrodollars, externalCarrierHoldMicrodollars: this.carrierHold,
      committedMicrodollars: settledMicrodollars + outstandingMicrodollars + this.carrierHold, attempts: this.attempts.size, settled, uncertain, pending,
      halted: [...this.halts].some(id => id !== this.continuation?.id),
      recoveryProbe: this.recoveryProbe ? this.recoveryProbe.attemptId ? "used" : "armed" : "none",
      reviewedContinuation: !!this.continuation };
  }

  async append(record: Event) {
    const temporary = join(this.folder, `append-${randomUUID()}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(record) + "\n"); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, join(this.folder, filename(this.size)));
    // Directory fsync is unsupported on Windows. Journal entries are file-synced
    // before the atomic same-directory rename; a killed process leaves its lock.
    if (process.platform !== "win32") {
      const parent = await open(this.folder, "r");
      try { await parent.sync(); } finally { await parent.close(); }
    }
    this.apply(record);
  }
}

function diagnoseUsage(value: unknown): z.infer<typeof usageDiagnosticsSchema> {
  const object = z.record(z.string(), z.unknown());
  const result = z.object({ usage: object }).safeParse(value);
  if (!result.success) return { fields: [], counters: {} };
  const usage = result.data.usage;
  const fields = Object.entries(usage).flatMap(([name, data]) => {
    if (!fieldName.safeParse(name).success) return [];
    const nested = object.safeParse(data);
    return [name, ...(nested.success ? Object.keys(nested.data).map(field => `${name}.${field}`) : [])];
  }).filter(name => fieldName.safeParse(name).success).sort().slice(0, 40);
  const counters: z.infer<typeof usageDiagnosticsSchema>["counters"] = {};
  for (const field of usageCounters) {
    const [parent, child] = field.split(".");
    const nested = child ? object.safeParse(usage[parent]) : undefined;
    const counter = count.safeParse(child ? nested?.data?.[child] : usage[parent]);
    if (counter.success) counters[field] = counter.data;
  }
  return { fields, counters };
}

async function pricedRequest(resource: RequestInfo | URL, init?: RequestInit) {
  const inbound = new Request(resource, init);
  if (inbound.url !== endpoint || inbound.method !== "POST" || !inbound.headers.get("x-api-key") ||
      inbound.headers.get("anthropic-version") !== "2023-06-01" ||
      [...inbound.headers.keys()].some(name => name.startsWith("anthropic-") && name !== "anthropic-version") ||
      inbound.headers.has("authorization")) throw new GuardError("QA request route or headers refused.");
  const parsed = requestSchema.safeParse(await inbound.json().catch(() => null));
  if (!parsed.success) throw new GuardError("QA request options refused.");
  const body = { ...parsed.data, service_tier: "standard_only", ...(parsed.data.model === "claude-sonnet-4-6" ? { inference_geo: "global" } : {}) };
  const request = new Request(endpoint, {
    method: "POST", redirect: "error", signal: inbound.signal,
    headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": inbound.headers.get("x-api-key")! },
    body: JSON.stringify(body),
  });
  return { request, body };
}

function providerFailure(value: unknown) {
  const providerError = z.object({ error: z.object({ type: z.string().optional(), message: z.string().optional() }) }).safeParse(value);
  const raw = providerError.success ? providerError.data.error : undefined;
  const parsed = errorType.safeParse(raw?.type);
  const type = parsed.success ? parsed.data : "unknown";
  const reason = type === "billing_error" || /\b(credit balance|billing|insufficient credit|payment required)\b/i.test(raw?.message ?? "") ? "billing" : "provider";
  return { type, category: reason as "billing" | "provider" };
}

function sanitizedError(response: Response, failure: ReturnType<typeof providerFailure>) {
  const headers = new Headers({ "content-type": "application/json" });
  for (const name of ["retry-after", "retry-after-ms"]) {
    const value = response.headers.get(name);
    if (value && /^\d{1,6}$/.test(value)) headers.set(name, value);
  }
  if (failure.category === "billing") headers.set("x-should-retry", "false");
  else {
    const retry = response.headers.get("x-should-retry");
    if (retry === "true" || retry === "false") headers.set("x-should-retry", retry);
  }
  return new Response(JSON.stringify({ type: "error", error: { type: failure.type, message: `QA provider request failed (${failure.category}).` } }), { status: response.status, headers });
}

type ReviewedAction = { recoveryFor: string } | { continuationFor: { priorId: string; probeId: string } } | { reserveCarrierAllowance: true };
async function withJournal<T>(folder: string, run: (budget: Budget) => Promise<T>, review?: ReviewedAction) {
  if (active) throw new GuardError("Another QA budget is active in this process.");
  active = true;
  const originalFetch = globalThis.fetch;
  const lockPath = join(folder, "run.lock");
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  let closed = false, storageFailure = false;
  const inFlight = new Set<Promise<Response>>();
  let tail = Promise.resolve();
  function serialize<U>(operation: () => Promise<U>): Promise<U> {
    const pending = tail.then(async () => {
      if (storageFailure) throw new GuardError("QA journal is unavailable.");
      return operation();
    });
    tail = pending.then(() => {}, () => {});
    return pending;
  }
  try {
    await mkdir(folder, { recursive: true });
    try { lock = await open(lockPath, "wx", 0o600); }
    catch { throw new GuardError("QA budget lock is held or unavailable."); }
    const journal = new Journal(folder);
    try { await journal.load(); }
    catch { throw new GuardError("QA journal could not be validated."); }
    const append = async (record: Event) => {
      try { await journal.append(record); }
      catch { storageFailure = true; throw new GuardError("QA journal append failed."); }
    };
    const recoveryFor = review && "recoveryFor" in review ? review.recoveryFor : undefined;
    if (recoveryFor !== undefined) {
      if (!z.uuid().safeParse(recoveryFor).success) throw new GuardError("QA recovery probe requires a valid prior attempt.");
      if (!journal.recoveryProbe) {
        if (!journal.qualifiesForRecovery(recoveryFor)) throw new GuardError("QA recovery probe has no qualifying unresolved attempt.");
        await append({ kind: "recovery_probe", id: recoveryFor, at: now(), review: "documented_standard_response_speed" });
      }
      if (!journal.canProbe(recoveryFor)) throw new GuardError("QA recovery probe is unavailable or already used.");
    }
    if (review && "continuationFor" in review) {
      const { priorId, probeId } = review.continuationFor;
      if (!journal.qualifiesForContinuation(priorId, probeId)) throw new GuardError("QA continuation has no qualifying settled probe.");
      await append({ kind: "continuation_review", id: priorId, probeId, at: now(), review: "compatible_standard_probe_settled" });
    }
    if (review && "reserveCarrierAllowance" in review && !journal.carrierHold) {
      if (!journal.canReserveCarrierAllowance()) throw new GuardError("QA carrier allowance exceeds the aggregate spending cap or accounting is halted.");
      await append({ kind: "external_allowance", category: "demo_sms_carrier", reserved: carrierAllowance, at: now() });
    }

    const submit = async (resource: RequestInfo | URL, init?: RequestInit) => {
      const { request, body } = await pricedRequest(resource, init);
      if (recoveryFor && (body.model !== liveQaProbeModel || body.max_tokens !== liveQaProbeMaxTokens || body.messages.length !== 1 ||
        body.messages[0].role !== "user" || body.messages[0].content !== liveQaProbePrompt || body.system !== undefined ||
        body.tools !== undefined || body.tool_choice !== undefined || body.temperature !== undefined || body.top_p !== undefined ||
        body.top_k !== undefined || body.stop_sequences !== undefined)) throw new GuardError("QA recovery probe payload does not match.");
      const id = randomUUID();
      const reserved = reservationCost(body.model, body.max_tokens);
      await serialize(async () => {
        const budget = journal.snapshot();
        const probe = recoveryFor && journal.canProbe(recoveryFor);
        if (closed || (budget.halted && !probe) || budget.committedMicrodollars + reserved > cap) throw new GuardError("QA spending cap or accounting halt reached.");
        await append({ kind: "reserve", id, at: now(), model: body.model, maxTokens: body.max_tokens, reserved, ...(probe ? { recoveryFor } : {}) });
      });

      let response: Response;
      try { response = await originalFetch(request); }
      catch {
        await serialize(() => append({ kind: "uncertain", id, at: now(), status: null, type: "unknown", category: "network" }));
        throw new GuardError("QA provider transport did not return a response.");
      }
      const value = await response.clone().json().catch(() => null);
      if (!response.ok) {
        const failure = providerFailure(value);
        await serialize(() => append({ kind: "uncertain", id, at: now(), status: response.status, ...failure }));
        return sanitizedError(response, failure);
      }

      const result = z.object({ model, usage: usageSchema }).safeParse(value);
      if (response.status !== 200 || !result.success || result.data.model !== body.model) {
        const usageDiagnostics = diagnoseUsage(value);
        await serialize(() => append({ kind: "uncertain", id, at: now(), status: response.status, type: "unknown", category: "invalid_usage", usageDiagnostics }));
        throw new GuardError("QA provider usage could not be settled.");
      }
      const { input_tokens: input, output_tokens: output } = result.data.usage;
      await serialize(() => append({ kind: "settle", id, at: now(), status: 200, input, output, actual: cost(body.model, input, output) }));
      if (input > rates[body.model].inputBound || output > body.max_tokens) throw new GuardError("QA provider usage exceeded its reserved envelope.");
      return response;
    };

    globalThis.fetch = (resource, init) => {
      if (closed) return Promise.reject(new GuardError("QA budget is closed."));
      const promise = submit(resource, init);
      inFlight.add(promise);
      void promise.then(() => inFlight.delete(promise), () => inFlight.delete(promise));
      return promise;
    };
    return await run({ snapshot: () => ({ ...journal.snapshot(), halted: storageFailure || journal.snapshot().halted }) });
  } finally {
    closed = true;
    try { await Promise.allSettled(inFlight); }
    finally {
      globalThis.fetch = originalFetch;
      try { if (lock) { await lock.close(); await unlink(lockPath); } }
      finally { active = false; }
    }
  }
}

/** Install before constructing the SDK client, which captures the current fetch. */
export function withLiveQaBudget<T>(run: (budget: Budget) => Promise<T>) {
  return withJournal(directory, run);
}

/** One physical probe against the same capped journal. Its prior debt remains committed. */
export function withLiveQaBudgetRecoveryProbe<T>(priorAttemptId: string, run: (budget: Budget) => Promise<T>) {
  return withJournal(directory, run, { recoveryFor: priorAttemptId });
}

/** The lead has reviewed the settled probe. This never releases the old reservation. */
export function withLiveQaBudgetReviewedContinuation<T>(priorId: string, probeId: string, run: (budget: Budget) => Promise<T>) {
  return withJournal(directory, run, { continuationFor: { priorId, probeId } });
}

/** The lead reserves an unverified carrier charge in this same authorization. */
export function reserveLiveQaCarrierAllowance() {
  return withJournal(directory, async budget => budget.snapshot(), { reserveCarrierAllowance: true });
}

/** Tests inject a temp directory and replace the underlying fetch with a mock. */
export const withLiveQaBudgetFixture = withJournal;
