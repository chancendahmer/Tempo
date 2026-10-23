import { expect, it } from "vitest";
import { currentAiInvocationScope, withAiInvocationScope } from "./ai-invocation-scope";

it("keeps concurrent account scopes isolated and restores the caller", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = withAiInvocationScope({ accountId: "first", executionId: "one" }, async () => {
    await gate;
    expect(currentAiInvocationScope()).toEqual({ accountId: "first", executionId: "one" });
  });
  await withAiInvocationScope({ accountId: "second", executionId: "two" }, async () => {
    expect(currentAiInvocationScope()?.accountId).toBe("second");
    release();
    await first;
    expect(currentAiInvocationScope()?.accountId).toBe("second");
  });
  expect(currentAiInvocationScope()).toBeUndefined();
});
