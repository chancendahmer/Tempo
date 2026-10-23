import { describe, expect, it } from "vitest";
import { ianaTimezoneSchema } from "./timezone";
import { gentleSetupActionSchema } from "./gentle-setup";

describe("explicit account time zone confirmation", () => {
  it.each(["UTC", "America/New_York", "Europe/London", "Pacific/Auckland"])("accepts a supported named zone: %s", value => {
    expect(ianaTimezoneSchema.parse(value)).toBe(value);
  });
  it.each(["", "EST", "+03:00", "-0500", "Eastern", "America/Unknown", "x".repeat(101)])("rejects offsets, ambiguous names and unknown zones: %s", value => {
    expect(ianaTimezoneSchema.safeParse(value).success).toBe(false);
  });
  it("rejects browser inference, account identity and opt-in fields as write authority", () => {
    expect(gentleSetupActionSchema.parse({ action: "timezone", timezone: " America/New_York " })).toEqual({ action: "timezone", timezone: "America/New_York" });
    expect(gentleSetupActionSchema.safeParse({ action: "timezone", timezone: "UTC", proactiveOptIn: true }).success).toBe(false);
    expect(gentleSetupActionSchema.safeParse({ action: "timezone", timezone: "UTC", userId: "neighbor" }).success).toBe(false);
    expect(gentleSetupActionSchema.safeParse({ action: "timezone", detectedTimezone: "UTC" }).success).toBe(false);
  });
});
