import { expect, it, vi } from "vitest";
import { createHeartbeatLifecycle } from "./heartbeat-lifecycle";

it("joins an in-flight heartbeat before retirement and prevents a late interval from recreating it", async () => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const write = vi.fn(async () => { await hold; });
  const lifecycle = createHeartbeatLifecycle(write);
  const pulse = lifecycle.pulse();
  expect(lifecycle.pulse()).toBe(pulse);
  let retired = false;
  const stop = lifecycle.stop().then(() => { retired = true; });
  await Promise.resolve();
  expect(retired).toBe(false);
  await lifecycle.pulse();
  expect(write).toHaveBeenCalledTimes(1);
  release();
  await stop;
  expect(retired).toBe(true);
  await lifecycle.pulse();
  expect(write).toHaveBeenCalledTimes(1);
});

it("settles failed in-flight work before allowing the shutdown caller to decide retirement", async () => {
  const write = vi.fn(async () => { throw new Error("Synthetic heartbeat failure"); });
  const lifecycle = createHeartbeatLifecycle(write);
  const pulse = lifecycle.pulse();
  const stopped = lifecycle.stop();
  await expect(pulse).rejects.toThrow("Synthetic heartbeat failure");
  await expect(stopped).rejects.toThrow("Synthetic heartbeat failure");
  await lifecycle.pulse();
  expect(write).toHaveBeenCalledTimes(1);
});
