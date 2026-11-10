import { mkdir, open, unlink, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export type LiveQaBudget = { readonly spent: number; readonly committed: number; readonly stopped: boolean; readonly cap: number };

/** Shared QA-only metering. Holds the existing ledger lock for the entire run.
 * The caller must load credentials normally; this helper never reads secrets. */
export async function withLiveQaBudget<T>(folder: string, cap: number, run: (budget: LiveQaBudget) => Promise<T>): Promise<T> {
  if (!Number.isFinite(cap) || cap <= 0 || cap > 10) throw Error("QA cap must be between zero and ten dollars");
  const ledgerPath = resolve(folder, "cost.json"), lockPath = resolve(folder, "run.lock");
  await mkdir(folder, { recursive: true });
  const lock = await open(lockPath, "wx");
  await lock.close();
  const originalFetch = globalThis.fetch;
  let committed = 0, spent = 0, stopped = false, call = 0;
  const ledger: object[] = [];
  const save = () => writeFile(ledgerPath, JSON.stringify({ cap, committed, spent, stopped, ledger }, null, 2));
  const budget = { get spent() { return spent; }, get committed() { return committed; }, get stopped() { return stopped; }, cap };
  let loaded = false;
  try {
    try {
      const prior = JSON.parse(await readFile(ledgerPath, "utf8"));
      if (prior.cap !== cap || !Number.isFinite(prior.committed) || !Number.isFinite(prior.spent) || prior.committed < prior.spent || prior.spent < 0 || !Array.isArray(prior.ledger)) throw Error("Invalid budget");
      committed = prior.committed; spent = prior.spent; ledger.push(...prior.ledger); call = prior.ledger.length;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    loaded = true;
    globalThis.fetch = async (resource, init) => {
      const request = new Request(resource, init), url = new URL(request.url);
      if (url.origin !== "https://api.anthropic.com" || url.pathname !== "/v1/messages" || request.method !== "POST" || stopped) throw Error("QA request blocked");
      const body = await request.clone().json();
      if (body.model !== "claude-sonnet-4-6" || body.stream || body.thinking || body.speed || body.tools?.some((tool: { type?: string }) => tool.type) || JSON.stringify(body).includes('"cache_control"') || !Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 5000) throw Error("Unpriced option");
      const countBody = Object.fromEntries(["model", "system", "messages", "tools", "tool_choice"].filter(key => key in body).map(key => [key, body[key]]));
      const count = await originalFetch("https://api.anthropic.com/v1/messages/count_tokens", { method: "POST", headers: request.headers, body: JSON.stringify(countBody), signal: AbortSignal.timeout(12000) });
      if (!count.ok) { stopped = true; ledger.push({ phase: "token_count", status: count.status }); await save(); throw Error("Token preflight failed"); }
      const counted = await count.json();
      if (!Number.isFinite(counted.input_tokens) || counted.input_tokens < 0) throw Error("Missing token count");
      const reserved = ((Math.ceil(counted.input_tokens * 1.2) + 1024) * 3 + body.max_tokens * 15) / 1e6;
      if (committed + reserved > cap) { stopped = true; await save(); throw Error("QA spending cap reached"); }
      committed += reserved; call += 1; await save();
      const response = await originalFetch(request);
      const result = await response.clone().json();
      if (response.ok && result.usage) {
        const usage = result.usage;
        if (usage.cache_creation_input_tokens || usage.cache_read_input_tokens || usage.server_tool_use?.web_search_requests) { stopped = true; throw Error("Unexpected capability"); }
        const actual = (usage.input_tokens * 3 + usage.output_tokens * 15) / 1e6;
        if (!Number.isFinite(actual) || actual < 0) throw Error("Missing usage");
        spent += actual; committed += actual - reserved;
        // Keep rounding from making a fully reconciled ledger look inconsistent.
        committed = Math.max(committed, spent);
        ledger.push({ call, status: response.status, input: usage.input_tokens, output: usage.output_tokens, actual });
        if (actual > reserved) stopped = true;
      } else { stopped = true; ledger.push({ call, status: response.status, reserved, category: /credit|billing|balance/i.test(result.error?.message ?? "") ? "billing" : result.error?.type ?? "unknown" }); }
      await save();
      return response;
    };
    return await run(budget);
  } finally {
    globalThis.fetch = originalFetch;
    try { if (loaded) await save(); } finally { await unlink(lockPath); }
  }
}
