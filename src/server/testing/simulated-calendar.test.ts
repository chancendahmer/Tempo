import { describe, expect, it } from "vitest";
import { createSimulatedCalendar } from "../../../scripts/lib/simulated-calendar";

describe("account-owned calendar fixture", () => {
  const start = "2027-01-15T00:00:00-05:00", end = "2027-01-16T00:00:00-05:00";
  it("reads confirmed updates without changing another account and applies create/delete", () => {
    const calendar = createSimulatedCalendar();
    calendar.apply("owner", { operation: "update", eventId: "fixture-dentist", start: "2027-01-15T16:00:00-05:00", end: "2027-01-15T17:00:00-05:00" });
    expect(JSON.parse(calendar.agenda("owner", start, end)).events[0].start.dateTime).toContain("T16:00");
    expect(JSON.parse(calendar.agenda("other", start, end)).events[0].start.dateTime).toContain("T14:00");
    calendar.apply("owner", { operation: "create", title: "Owner private event", start: "2027-01-15T18:00:00-05:00", end: "2027-01-15T19:00:00-05:00" });
    const added = JSON.parse(calendar.agenda("owner", start, end)).events.find((row: { title: string }) => row.title === "Owner private event");
    expect(calendar.agenda("other", start, end)).not.toContain("Owner private event");
    expect(() => calendar.apply("other", { operation: "delete", eventId: added.id })).toThrow("not found in account");
    calendar.apply("owner", { operation: "delete", eventId: added.id });
    expect(JSON.parse(calendar.agenda("owner", start, end)).events).toHaveLength(1);
  });
  it("includes overlapping events but excludes events touching only a range boundary", () => {
    const calendar = createSimulatedCalendar();
    const agenda = (from: string, to: string) => JSON.parse(calendar.agenda("owner", `2027-01-15T${from}:00-05:00`, `2027-01-15T${to}:00-05:00`)).events;
    expect(agenda("14:30", "16:00")).toHaveLength(1);
    expect(agenda("13:00", "14:30")).toHaveLength(1);
    expect(agenda("13:00", "14:00")).toHaveLength(0);
    expect(agenda("15:00", "16:00")).toHaveLength(0);
    expect(JSON.parse(calendar.agenda("owner", "2027-01-16T00:00:00Z", "2027-01-17T00:00:00Z")).events).toHaveLength(0);
  });
});
