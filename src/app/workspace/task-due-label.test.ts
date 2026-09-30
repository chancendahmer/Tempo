import { describe, expect, it } from "vitest";
import { taskDueLabel } from "./task-due-label";

describe("task due labels", () => {
  it("uses the account's local end of day, including daylight saving offsets", () => {
    expect(taskDueLabel("2026-10-02T03:59:00Z", "America/New_York")).toBe("By end of day");
    expect(taskDueLabel("2026-12-02T04:59:00Z", "America/New_York")).toBe("By end of day");
    expect(taskDueLabel("2026-10-02T03:59:00Z", "UTC")).not.toBe("By end of day");
  });
  it("preserves other explicit times and uses the local date", () => {
    const input = "2026-10-02T03:30:00Z";
    expect(taskDueLabel(input, "America/New_York")).toBe(new Intl.DateTimeFormat(undefined, { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(input)));
    expect(taskDueLabel("2026-10-02T03:59:00Z", "America/New_York", true)).toBe("Oct 1 · By end of day");
  });
});
