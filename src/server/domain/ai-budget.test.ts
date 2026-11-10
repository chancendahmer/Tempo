import { describe, expect, it } from "vitest";
import { aiBudgetIntegerSchema, aiBudgetPolicySchema, aiBudgetReservationSchema, aiBudgetUsageSchema } from "./ai-budget";

const usage = { inputTokens: 1, outputTokens: 2, cacheCreationInputTokens: 3, cacheReadInputTokens: 4, cacheCreation5mInputTokens: 1, cacheCreation1hInputTokens: 2, webSearchRequests: 0 };
describe("AI budget contracts", () => {
  it("requires exact nonnegative safe integer microdollars and usage", () => {
    for (const invalid of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null]) expect(aiBudgetIntegerSchema.safeParse(invalid).success).toBe(false);
    expect(aiBudgetIntegerSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(aiBudgetUsageSchema.parse(usage)).toEqual(usage);
    expect(aiBudgetUsageSchema.safeParse({ ...usage, unsupported: 0 }).success).toBe(false);
    expect(aiBudgetUsageSchema.safeParse({ ...usage, outputTokens: undefined }).success).toBe(false);
    expect(aiBudgetUsageSchema.safeParse({ ...usage, cacheCreationInputTokens: 4 }).success).toBe(false);
  });
  it("requires all four explicit caps and trusted UUID scope", () => {
    expect(aiBudgetPolicySchema.safeParse({ globalDailyMicrodollars: 1, accountDailyMicrodollars: 1, accountDailyCalls: 1 }).success).toBe(false);
    expect(aiBudgetReservationSchema.safeParse({ accountId: "a phone or prompt" }).success).toBe(false);
  });
});
