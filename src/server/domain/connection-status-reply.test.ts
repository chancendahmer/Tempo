import { describe, expect, it } from "vitest";
import { connectionStatusReply } from "./connection-status-reply";

describe("connection status reply", () => {
  it("preserves account-specific availability and states the step-storage boundary", () => {
    const reply = connectionStatusReply(JSON.stringify({ calendar: "not connected", webSearch: "disabled by operator" }));
    expect(reply).toContain("Google Calendar: not connected");
    expect(reply).toContain("disabled by operator");
    expect(reply).toContain("has no step-count field");
    expect(reply).toContain("note in Thought inbox");
  });
  it("keeps unavailable status truthful", () => {
    expect(connectionStatusReply("Account connections unavailable.")).toContain("Account connections unavailable.");
  });
  it("retains workspace and Wake capability context for general app questions", () => {
    const reply = connectionStatusReply(JSON.stringify({
      workspace: "recipes and food logs; edits appear after refresh",
      wakeAndWindDown: "manual screen sessions; no scheduled wake alarms",
    }));
    expect(reply).toContain("Workspace: recipes and food logs; edits appear after refresh");
    expect(reply).toContain("Wake & Wind Down: manual screen sessions; no scheduled wake alarms");
  });
});
