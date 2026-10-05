import { describe, expect, it } from "vitest";
import { calendarConnectionCopy } from "./calendar-status";

describe("calendar connection guidance", () => {
  it("gives revoked connections a clear reconnect state and action", () => {
    expect(calendarConnectionCopy("requires_reauth")).toMatchObject({
      badge: "Reconnect required",
      badgeClass: "reauthorize",
      action: "Reconnect Google Calendar",
    });
  });

  it("distinguishes a new connection from a healthy one", () => {
    expect(calendarConnectionCopy("disconnected").action).toBe("Connect Google Calendar");
    expect(calendarConnectionCopy("active").badge).toBe("Connected");
  });
});
