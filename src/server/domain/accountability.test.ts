import { describe, expect, it } from "vitest";
import {
  buildFollowupAccountabilityPrompt,
  buildInitialAccountabilityPrompt,
  classifyAccountabilityReply,
} from "./accountability";

describe("accountability prompts", () => {
  it("recognizes the two-stage commitments without treating unrelated replies as consent", () => {
    expect(classifyAccountabilityReply("I will get started right now!", "initial")).toBe("start");
    expect(classifyAccountabilityReply("Give me 15", "initial")).toBe("snooze");
    expect(classifyAccountabilityReply("I told myself I would do it, starting now.", "followup")).toBe("start");
    expect(classifyAccountabilityReply("Not today sorry", "followup")).toBe("decline");
    expect(classifyAccountabilityReply("tell me about tomorrow", "initial")).toBeNull();
  });

  it("keeps deterministic Sendblue fallback prompts inside the SMS safety limit", () => {
    expect(buildInitialAccountabilityPrompt("A".repeat(500))).toHaveLength(320);
    expect(buildFollowupAccountabilityPrompt()).toContain("I told myself I would do it, starting now.");
  });
});
