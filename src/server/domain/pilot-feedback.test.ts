import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pilotFeedbackSchema } from "./pilot-feedback";

const valid = () => ({ requestId: randomUUID(), type: "problem", section: "reminders", impact: "blocked", followUpConsent: false });
describe("minimal private feedback input", () => {
  it("requires explicit follow-up choice and permits no optional text", () => {
    expect(pilotFeedbackSchema.parse(valid()).detail).toBeNull();
    expect(pilotFeedbackSchema.safeParse({ ...valid(), followUpConsent: undefined }).success).toBe(false);
    expect(pilotFeedbackSchema.parse({ ...valid(), detail: "  ", followUpConsent: true }).followUpConsent).toBe(true);
  });
  it.each([
    { userId: randomUUID() }, { transcript: "private chat" }, { phone: "+12025550198" }, { screenshot: "file" },
    { detail: "a".repeat(1001) }, { section: "https://private.example?token=secret" }, { impact: "urgent" }, { type: "other" },
  ])("rejects undeclared personal attachments and unbounded fields (%j)", change => {
    expect(pilotFeedbackSchema.safeParse({ ...valid(), ...change }).success).toBe(false);
  });
});
