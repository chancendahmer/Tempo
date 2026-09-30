import { describe, expect, it } from "vitest";
import {
  commitmentTitle,
  handleOnboardingMessage,
  parseCoachingTone,
  parseQuietHours,
  parseTimezone,
} from "./onboarding";

describe("SMS onboarding", () => {
  it.each([
    ["Eastern", "America/New_York"],
    ["Pacific time", "America/Los_Angeles"],
    ["America/Chicago", "America/Chicago"],
    ["UTC", "UTC"],
  ])("parses %s as %s", (input, expected) => {
    expect(parseTimezone(input)).toBe(expected);
  });

  it("rejects an unknown timezone", () => {
    expect(parseTimezone("somewhere over there")).toBeNull();
  });

  it.each([
    ["11pm to 7am", { start: "23:00:00", end: "07:00:00" }],
    ["22:30 until 06:15", { start: "22:30:00", end: "06:15:00" }],
    ["from 9 am - 5 pm", { start: "09:00:00", end: "17:00:00" }],
  ])("parses quiet hours from %s", (input, expected) => {
    expect(parseQuietHours(input)).toEqual(expected);
  });

  it("parses coaching preference language", () => {
    expect(parseCoachingTone("Be pretty direct with me")).toBe("direct");
    expect(parseCoachingTone("A gentle approach works best")).toBe("gentle");
    expect(parseCoachingTone("A mix of both")).toBe("balanced");
  });

  it("extracts a useful first commitment", () => {
    expect(commitmentTitle("I need to finish the Q3 report.")).toBe("finish the Q3 report");
  });

  it("uses a quick contact choice before the calendar step", () => {
    expect(handleOnboardingMessage("introduction", "I need more help")).toMatchObject({
      nextState: "introduction",
      reply: expect.stringContaining("reply DONE"),
    });
    expect(handleOnboardingMessage("introduction", "DONE")).toMatchObject({
      nextState: "calendar",
      reply: expect.stringContaining("One last setup step"),
    });
  });

  it("retains the detailed preference flow for the legacy first-task state", () => {
    const task = handleOnboardingMessage("first_task", "I need to finish the Q3 report");
    expect(task).toMatchObject({ nextState: "timezone", createTaskTitle: "finish the Q3 report" });

    const timezone = handleOnboardingMessage(task.nextState, "Eastern");
    expect(timezone).toMatchObject({ nextState: "quiet_hours", updates: { timezone: "America/New_York" } });

    const quiet = handleOnboardingMessage(timezone.nextState, "11pm to 7am");
    expect(quiet).toMatchObject({
      nextState: "coaching_style",
      updates: { quietHoursStart: "23:00:00", quietHoursEnd: "07:00:00" },
    });

    const tone = handleOnboardingMessage(quiet.nextState, "direct");
    expect(tone).toMatchObject({ nextState: "calendar", updates: { coachingTone: "direct" } });

    expect(handleOnboardingMessage("calendar", "not now")).toMatchObject({
      handled: true,
      nextState: "complete",
    });
  });

  it.each([
    "SKIP",
    "Not now",
    "Can we skip that and get started?",
    "I only see text, there isn't a contact card. Can we skip that and get started?",
    "There is no contact card. I'd like to continue.",
    "Please skip the contact card",
  ])("allows optional contact setup to be skipped: %s", message => {
    const result = handleOnboardingMessage("introduction", message);
    expect(result).toMatchObject({ handled: true, nextState: "calendar" });
    expect(result.reply).toContain("saving my contact is optional");
    expect(result.reply).not.toContain("you’ve added");
    expect(result.updates).toBeUndefined();
    expect(result.createTaskTitle).toBeUndefined();
  });

  it("offers an exit for missing-card help without claiming a contact was saved", () => {
    for (const message of ["I NEED MORE HELP", "There isn't a contact card", "I don't want to skip"]) {
      const result = handleOnboardingMessage("introduction", message);
      expect(result.nextState).toBe("introduction");
      expect(result.reply).toContain("SKIP");
    }
  });

  it("does not use contact skipping to bypass consent or interpret opt-out as skipping", () => {
    expect(handleOnboardingMessage("awaiting_consent", "SKIP")).toEqual({ handled: true, nextState: "awaiting_consent" });
    expect(handleOnboardingMessage("introduction", "STOP").nextState).toBe("introduction");
  });
});
