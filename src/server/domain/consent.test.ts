import { describe, expect, it, vi } from "vitest";
import {
  ConsentRepository,
  PRIVACY_VERSION,
  SMS_DISCLOSURE_VERSION,
  TERMS_VERSION,
  hashAuditValue,
  recordWebConsent,
} from "./consent";

describe("web SMS consent", () => {
  it("normalizes the phone and records versioned evidence", async () => {
    const grantWebConsent = vi.fn<ConsentRepository["grantWebConsent"]>().mockResolvedValue({ userId: "user-1" });

    await recordWebConsent(
      { grantWebConsent },
      {
        countryCode: "US",
        callingCode: "+1",
        areaCode: "202",
        subscriberNumber: "555-0198",
        consent: true,
      },
      { ip: "203.0.113.4", userAgent: "Tempo test", auditKey: "audit-secret" },
    );

    expect(grantWebConsent).toHaveBeenCalledWith({
      phoneE164: "+12025550198",
      disclosureVersion: SMS_DISCLOSURE_VERSION,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      sourceIpHash: hashAuditValue("203.0.113.4", "audit-secret"),
      userAgent: "Tempo test",
      evidence: {
        submittedCountry: "US",
        submittedCallingCode: "+1",
        submittedAreaCode: "202",
        onboardingFlow: "tempo_first",
      },
      scheduleInitialMessages: true,
    });
  });

  it("records an inbound-first Linq onboarding without scheduling an unsolicited welcome", async () => {
    const grantWebConsent = vi.fn<ConsentRepository["grantWebConsent"]>().mockResolvedValue({ userId: "user-2" });

    await recordWebConsent(
      { grantWebConsent },
      {
        countryCode: "US", callingCode: "+1", areaCode: "415",
        subscriberNumber: "5550198", consent: true,
      },
      { auditKey: "audit-secret", onboardingFlow: "user_first" },
    );

    expect(grantWebConsent).toHaveBeenCalledWith(expect.objectContaining({
      scheduleInitialMessages: false,
      evidence: expect.objectContaining({ onboardingFlow: "user_first" }),
    }));
  });

  it("requires an affirmative consent value", async () => {
    const repository: ConsentRepository = {
      grantWebConsent: vi.fn(),
    };

    await expect(
      recordWebConsent(
        repository,
        {
          countryCode: "US",
          callingCode: "+1",
          areaCode: "202",
          subscriberNumber: "555-0198",
          consent: false,
        },
        { auditKey: "audit-secret" },
      ),
    ).rejects.toThrow();
  });

  it("rejects a forged country and calling-code combination", async () => {
    await expect(recordWebConsent(
      { grantWebConsent: vi.fn() },
      {
        countryCode: "US",
        callingCode: "+44",
        areaCode: "20",
        subscriberNumber: "79460958",
        consent: true,
      },
      { auditKey: "audit-secret" },
    )).rejects.toThrow("Country and calling code do not match");
  });
});
