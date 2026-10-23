import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock("./server/observability/web-budget-heartbeat", () => ({ registerWebBudgetHeartbeat: mocks.register }));
import { register } from "./instrumentation";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); mocks.register.mockReset(); });
it("starts web attestation only in a server Node runtime, excluding builds/edge", async () => {
  vi.stubEnv("NEXT_RUNTIME", "edge"); await register();
  vi.stubEnv("NEXT_RUNTIME", "nodejs"); vi.stubEnv("NEXT_PHASE", "phase-production-build"); await register();
  expect(mocks.register).not.toHaveBeenCalled();
  vi.stubEnv("NEXT_PHASE", "phase-production-server"); await register();
  expect(mocks.register).toHaveBeenCalledTimes(1);
});
it("contains startup instrumentation failures so requests can still handle sign-in/STOP", async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs"); vi.stubEnv("NEXT_PHASE", "phase-production-server");
  mocks.register.mockImplementation(() => { throw new Error("private configuration detail"); });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await expect(register()).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledExactlyOnceWith("Tempo web configuration attestation unavailable");
});
