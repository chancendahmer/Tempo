import { describe, expect, it } from "vitest";
import { InvalidPhoneNumberError, normalizeE164, phonePartsToE164, signupPhoneToE164 } from "./phone";

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

  it.each([
    ["US", "(415) 555-0198", "+14155550198"],
    ["US", "1 (415) 555-0198", "+14155550198"],
    ["US", "+1 (415) 555-0198", "+14155550198"],
    ["CA", "416.555.0198", "+14165550198"],
    ["GB", "07700 900123", "+447700900123"],
    ["GB", "+44 7700 900123", "+447700900123"],
    ["AU", "0412 345 678", "+61412345678"],
    ["AU", "+61 412 345 678", "+61412345678"],
  ])("normalizes %s signup input %s", (countryCode, phoneNumber, expected) => {
    expect(signupPhoneToE164({ countryCode, phoneNumber })).toBe(expected);
  });

  it.each([
    ["FR", "+33 6 12 34 56 78"],
    ["US", "+44 7700 900123"],
    ["US", "555-0198"],
    ["GB", "7700 900"],
    ["AU", "412 345"],
    ["US", "Call me at (415) 555-0198"],
    ["US", "(415) 555-0198 x123"],
  ])("rejects %s signup input %s", (countryCode, phoneNumber) => {
    expect(() => signupPhoneToE164({ countryCode, phoneNumber })).toThrow(InvalidPhoneNumberError);
  });
});
