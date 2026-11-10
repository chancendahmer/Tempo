import { afterEach, expect, it, vi } from "vitest";
import { registerWebBudgetHeartbeat, startWebHeartbeat } from "./web-budget-heartbeat";

vi.mock("../db/repositories/operational-repository", () => ({ OperationalRepository: class { heartbeat = vi.fn().mockResolvedValue(undefined); } }));
vi.mock("./logger", () => ({ logger: { warn: vi.fn() } }));
afterEach(() => vi.useRealTimers());
it("serializes pulses, joins shutdown and cannot recreate a row from a late interval", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const write = vi.fn(async () => { await hold; });
  const failure = vi.fn();
  const heartbeat = startWebHeartbeat({ write, failure });
  await vi.advanceTimersByTimeAsync(90_000);
  expect(write).toHaveBeenCalledTimes(1);
  let stopped = false;
  const stop = heartbeat.stop().then(() => { stopped = true; });
  await Promise.resolve(); expect(stopped).toBe(false);
  release(); await stop;
  await vi.advanceTimersByTimeAsync(90_000);
  expect(write).toHaveBeenCalledTimes(1); expect(failure).not.toHaveBeenCalled();
});
it("contains DB failure and retries on the next pulse without rejecting server startup", async () => {
  vi.useFakeTimers();
  const failure = vi.fn(); const write = vi.fn().mockRejectedValue(new Error("private database detail"));
  const heartbeat = startWebHeartbeat({ write, failure });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(write).toHaveBeenCalledTimes(2); expect(failure).toHaveBeenCalledTimes(2);
  expect(failure.mock.calls).toEqual([[], []]);
  await heartbeat.stop();
});
it("reuses one process singleton and shutdown handlers across instrumentation/HMR registrations", async () => {
  vi.useFakeTimers();
  const beforeTerm = process.listenerCount("SIGTERM"), beforeInt = process.listenerCount("SIGINT");
  registerWebBudgetHeartbeat(); registerWebBudgetHeartbeat();
  expect(process.listenerCount("SIGTERM")).toBe(beforeTerm + 1);
  expect(process.listenerCount("SIGINT")).toBe(beforeInt + 1);
  const slot = Symbol.for("tempo.web-budget-heartbeat.v1");
  const global = globalThis as typeof globalThis & { [slot]?: { stop(): Promise<void> } };
  await global[slot]?.stop(); delete global[slot];
  // Remove only the two handlers installed by this test, preserving the host runner.
  process.removeListener("SIGTERM", process.listeners("SIGTERM").at(-1)!);
  process.removeListener("SIGINT", process.listeners("SIGINT").at(-1)!);
});
