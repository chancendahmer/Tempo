import { afterEach, describe, expect, it, vi } from "vitest";
import { lightFrame, startSoundscape } from "./wake-session";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("light sessions", () => {
  it("rises from dark to the requested maximum and reverses for sunset", () => {
    expect(lightFrame("sunrise", 0, 1000, 0.8).brightness).toBe(0);
    expect(lightFrame("sunrise", 500, 1000, 0.8).brightness).toBeCloseTo(0.4);
    expect(lightFrame("sunrise", 1000, 1000, 0.8).brightness).toBe(0.8);
    expect(lightFrame("sunset", 0, 1000, 0.8).brightness).toBe(0.8);
    expect(lightFrame("sunset", 1000, 1000, 0.8).brightness).toBe(0);
  });
  it("uses elapsed time, clamps late/background updates and does not exceed maximum", () => {
    expect(lightFrame("sunrise", 120_000, 60_000, 2)).toEqual({ progress: 1, light: 1, brightness: 1, remainingSeconds: 0 });
    expect(lightFrame("sunrise", -1, 60_000, -1).brightness).toBe(0);
    expect(lightFrame("sunset", 59_500, 60_000, 1).remainingSeconds).toBe(1);
  });
  it("closes audio and cancels birds when stopped, even before audio becomes ready", async () => {
    vi.useFakeTimers();
    let resume!: () => void;
    const close = vi.fn().mockResolvedValue(undefined);
    const createOscillator = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("AudioContext", class {
      state = "running";
      destination = {};
      resume = () => new Promise<void>(resolve => { resume = resolve; });
      createGain = () => ({ gain: { value: 0 }, connect: vi.fn(), disconnect });
      close = close;
      createOscillator = createOscillator;
    });
    const sound = startSoundscape("birds");
    sound.stop();
    sound.stop();
    resume();
    await sound.ready;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(createOscillator).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
