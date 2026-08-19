import { describe, expect, it } from "vitest";
import { parseMemoryCorrection } from "./memory-service";

describe("memory corrections", () => {
  it("recognizes explicit deletion and preference corrections", () => {
    expect(parseMemoryCorrection("forget what you know about mornings")).toEqual({ type: "forget", query: "mornings" });
    expect(parseMemoryCorrection("that's not true")).toEqual({ type: "forget_recent" });
    expect(parseMemoryCorrection("Actually, I prefer gentle reminders.")).toEqual({
      type: "preference",
      content: "The user prefers gentle reminders.",
    });
    expect(parseMemoryCorrection("Remember that I usually focus best before lunch.")).toEqual({
      type: "remember",
      category: "pattern",
      content: "The user said: I usually focus best before lunch.",
    });
    expect(parseMemoryCorrection("Remember my thesis advisor is Dr. Lee.")).toEqual({
      type: "remember",
      category: "fact",
      content: "The user said: my thesis advisor is Dr. Lee.",
    });
    expect(parseMemoryCorrection("What should I do next?")).toBeNull();
  });
});
