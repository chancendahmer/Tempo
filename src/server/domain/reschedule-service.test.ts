import { describe, expect, it } from "vitest";
import { parseRescheduleHeuristically } from "./reschedule-service";

describe("reschedule fast path", () => {
  it.each(["Move my walk/jog to Saturday at 9 AM. Keep it linked to the running goal.", "Reschedule the report for tomorrow at noon", "Move the laundry for later"])("defers contextual move requests: %s", message => {
    expect(parseRescheduleHeuristically(message)).toBeNull();
  });
  it("retains the bounded cannot-today availability shortcut", () => {
    expect(parseRescheduleHeuristically("I can't finish the report today.")).toEqual({ type: "reschedule_task", taskQuery: "report", afterToday: true });
  });
});
