import { describe, expect, it } from "vitest";
import { checkinAvailability } from "./checkin-availability";

const now = new Date("2026-11-11T16:00:00Z");
const ready = { proactiveOptIn: true, accountActive: true, onboardingComplete: true, dailyInterventionCap: 1, deliveryEnabled: true, calendar: { status: "active", lastSyncedAt: now }, now };
describe("customer-visible check-in availability", () => {
  it("distinguishes saved permission from operator rollout", () => {
    expect(checkinAvailability({ ...ready, proactiveOptIn: false }).state).toBe("off");
    expect(checkinAvailability({ ...ready, deliveryEnabled: false }).state).toBe("paused");
    expect(checkinAvailability(ready).state).toBe("eligible");
  });
  it("does not imply permission overrides account or setup gates", () => {
    expect(checkinAvailability({ ...ready, accountActive: false }).state).toBe("paused");
    expect(checkinAvailability({ ...ready, dailyInterventionCap: 0 }).state).toBe("paused");
    expect(checkinAvailability({ ...ready, onboardingComplete: false }).state).toBe("setup");
  });
  it("reports cleanup-only permission without promising task coaching or bypassing opt-in", () => {
    expect(checkinAvailability({ ...ready, deliveryEnabled: false, cleanupEnabled: true })).toMatchObject({ state: "eligible", title: "Old-item reviews are active" });
    expect(checkinAvailability({ ...ready, deliveryEnabled: false, cleanupEnabled: true, proactiveOptIn: false }).state).toBe("off");
    expect(checkinAvailability({ ...ready, deliveryEnabled: false, cleanupEnabled: true, calendar: null }).state).toBe("calendar");
  });
  it.each([null, { status: "revoked", lastSyncedAt: now }, { status: "active", lastSyncedAt: null }, { status: "active", lastSyncedAt: "invalid" }, { status: "active", lastSyncedAt: new Date(now.getTime() - 46 * 60_000) }, { status: "active", lastSyncedAt: new Date(now.getTime() + 1) }])("requires fresh trustworthy availability: %j", calendar => {
    expect(checkinAvailability({ ...ready, calendar }).state).toBe("calendar");
  });
});
