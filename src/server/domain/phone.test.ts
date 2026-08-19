import { describe, expect, it } from "vitest";
import { InvalidPhoneNumberError, normalizeE164, phonePartsToE164 } from "./phone";

describe("phone normalization", () => {
  it("combines signup fields into E.164", () => {
    expect(
      phonePartsToE164({
        countryCode: "US",
        callingCode: "+1",
        areaCode: "202",
        subscriberNumber: "555-0198",
      }),
    ).toBe("+12025550198");
  });

  it("normalizes an inbound Twilio number", () => {
    expect(normalizeE164("+1 (415) 555-0132")).toBe("+14155550132");
  });

  it("rejects impossible numbers", () => {
    expect(() => normalizeE164("+123")).toThrow(InvalidPhoneNumberError);
  });
});
