import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { withLiveQaBudget } from "../../../scripts/lib/live-qa-budget";
import { assertLocalQaDatabase } from "../../../scripts/lib/local-web-message-probe";

const folders: string[] = [];
async function folder() {
  const parent = resolve("qa"); await mkdir(parent, { recursive: true });
  const path = await mkdtemp(resolve(parent, "budget-unit-")); folders.push(path); return path;
}
const request = () => fetch("https://api.anthropic.com/v1/messages", { method: "POST", body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 300, messages: [{ role: "user", content: "Synthetic test" }] }) });
afterEach(async () => {
  vi.restoreAllMocks();
  for (const path of folders.splice(0)) {
    if (!path.startsWith(resolve("qa") + sep + "budget-unit-")) throw Error("Unexpected QA cleanup path");
    await rm(path, { recursive: true });
  }
});

it("shares the prior ledger across runs and meters only approved provider requests", async () => {
  const path = await folder();
  await writeFile(resolve(path, "cost.json"), JSON.stringify({ cap: 7, committed: 5, spent: 4.8, stopped: false, ledger: [] }));
  const transport = vi.spyOn(globalThis, "fetch").mockImplementation(async resource => new Response(JSON.stringify(String(resource).includes("count_tokens") ? { input_tokens: 100 } : { usage: { input_tokens: 100, output_tokens: 10 } }), { status: 200 }));
  await withLiveQaBudget(path, 7, async budget => {
    expect(budget.spent).toBe(4.8);
    await expect(fetch("https://example.com")).rejects.toThrow("blocked");
    expect(transport).not.toHaveBeenCalled();
    await request();
    expect(budget.spent).toBeCloseTo(4.80045);
    expect(budget.committed).toBeCloseTo(5.00045);
  });
  expect(globalThis.fetch).toBe(transport);
  await withLiveQaBudget(path, 7, async budget => { expect(budget.spent).toBeCloseTo(4.80045); await request(); });
  const result = JSON.parse(await readFile(resolve(path, "cost.json"), "utf8"));
  expect(result.spent).toBeCloseTo(4.8009);
  expect(result.ledger).toHaveLength(2);
  expect(transport).toHaveBeenCalledTimes(4);
});

it("refuses over-cap requests before billable transport and preserves uncertain reservations", async () => {
  const path = await folder();
  const transport = vi.spyOn(globalThis, "fetch").mockImplementation(async resource => {
    if (String(resource).includes("count_tokens")) return new Response(JSON.stringify({ input_tokens: 100 }));
    throw Error("Simulated lost response");
  });
  await withLiveQaBudget(path, 0.001, async budget => { await expect(request()).rejects.toThrow("cap reached"); expect(budget.stopped).toBe(true); });
  expect(transport).toHaveBeenCalledTimes(1);
  const other = await folder();
  await withLiveQaBudget(other, 7, async () => { await expect(request()).rejects.toThrow("lost response"); });
  const result = JSON.parse(await readFile(resolve(other, "cost.json"), "utf8"));
  expect(result.committed).toBeGreaterThan(0); expect(result.spent).toBe(0);
});

it("holds a single-run lock and never overwrites an invalid or differently capped ledger", async () => {
  const path = await folder();
  await withLiveQaBudget(path, 7, async () => { await expect(withLiveQaBudget(path, 7, async () => undefined)).rejects.toThrow(); });
  const prior = await readFile(resolve(path, "cost.json"), "utf8");
  await expect(withLiveQaBudget(path, 6, async () => undefined)).rejects.toThrow("Invalid budget");
  expect(await readFile(resolve(path, "cost.json"), "utf8")).toBe(prior);
});

it.each(["postgres://user:fake@remote.example/tempo_qa", "postgres://user:fake@127.0.0.1/production", "postgres://user:fake@localhost/tempo_qa?host=remote.example", "https://localhost/tempo_qa"])("rejects unsafe probe databases without connecting: %s", url => {
  expect(() => assertLocalQaDatabase(url)).toThrow();
});

it("accepts an explicitly local disposable database without exposing its URL", () => {
  expect(() => assertLocalQaDatabase("postgres://user:fake@127.0.0.1:55437/tempo_ui_release")).not.toThrow();
});
