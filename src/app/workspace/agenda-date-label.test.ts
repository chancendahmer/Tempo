import { describe, expect, it } from "vitest";
import { agendaDateLabel } from "./agenda-date-label";

describe("horizon date labels", () => {
  it("distinguishes tomorrow from today across account-local midnight", () => {
    const now = new Date("2026-10-01T02:00:00Z");
    expect(agendaDateLabel("2026-10-01T03:00:00Z", "America/New_York", now)).toBe("Today");
    expect(agendaDateLabel("2026-10-01T20:00:00Z", "America/New_York", now)).toBe("Tomorrow");
    expect(agendaDateLabel("2026-10-01T20:00:00Z", "UTC", now)).toBe("Today");
  });
  it("handles year and daylight saving boundaries by calendar date", () => {
    expect(agendaDateLabel("2027-01-01T17:00:00Z", "America/New_York", new Date("2027-01-01T03:00:00Z"))).toBe("Tomorrow");
    expect(agendaDateLabel("2026-11-02T04:00:00Z", "America/New_York", new Date("2026-11-01T03:30:00Z"))).toBe("Tomorrow");
  });
  it("includes day and date for later entries", () => {
    expect(agendaDateLabel("2026-10-04T16:00:00Z", "America/New_York", new Date("2026-10-01T16:00:00Z"))).toBe("Sun, Oct 4");
  });
});
