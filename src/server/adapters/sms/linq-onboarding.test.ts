import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "../../config/env";
import { LinqOnboardingService } from "./linq-onboarding";

const priorKey = process.env.LINQ_API_KEY;

describe("Linq inbound-first onboarding", () => {
  beforeEach(() => {
    process.env.LINQ_API_KEY = "linq-test-key";
    resetEnvCacheForTests();
  });

  afterEach(() => {
    if (priorKey === undefined) delete process.env.LINQ_API_KEY;
    else process.env.LINQ_API_KEY = priorKey;
    resetEnvCacheForTests();
  });

  it("assigns a healthy line for one new recipient and returns its contact card", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      phone_number: "+12025550111",
      vcf_url: "https://cdn.linqapp.com/contact/tempo.vcf",
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const assignment = await new LinqOnboardingService(request).assignLine("+14155550198");

    expect(assignment).toEqual({
      phoneNumber: "+12025550111",
      vcfUrl: "https://cdn.linqapp.com/contact/tempo.vcf",
    });
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toBe("https://api.linqapp.com/api/partner/v3/available_number?to=%2B14155550198");
    expect(init?.headers).toEqual({ Authorization: "Bearer linq-test-key" });
  });

  it("does not record a line assignment when Linq has no healthy line", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response("{}", { status: 409 }));
    await expect(new LinqOnboardingService(request).assignLine("+14155550198"))
      .rejects.toMatchObject({ status: 409 });
  });
});
