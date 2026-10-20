import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JourneyView } from "./JourneyView";
import { GentleSetup } from "./GentleSetup";
import { previewWorkspace, type Workspace } from "./workspace-data";
import { calculateActivityStreak } from "../../server/domain/activity-streak";

const now = new Date("2026-10-19T12:00:00Z");
const render = (data: Workspace) => renderToStaticMarkup(createElement(JourneyView, { data, now, preview: false, onBack: () => {}, onSetup: () => {}, motion: false, setMotion: () => {} }));
describe("journey's honest display boundaries", () => {
  it("keeps an unavailable summary distinct from a real zero and grants no earned badges", () => {
    const data = previewWorkspace(now);
    data.activityStreak = undefined;
    expect(render(data)).toContain("Your progress isn’t available yet.");
    expect(render(data)).not.toContain("data-stop=");
    data.activityStreak = { ...calculateActivityStreak([], "UTC", now), historyNote: "Based on recorded activity" };
    const html = render(data);
    expect(html).toContain("3 more active days to First light");
    expect(html).toContain("YOUR STARTING POINT");
    expect(html).not.toContain("· REACHED");
    expect(html).toMatch(/disabled=""[^>]*>.*?Celebrate your progress/);
  });
  it("honors hidden progress without leaking the day counts through map labels", () => {
    const data = previewWorkspace(now);
    data.setup = { displayName: "Test", showStreak: false, coachingTone: "balanced", setupStatus: "complete" };
    const html = render(data);
    expect(html).toContain("Your pace, without the numbers.");
    expect(html).not.toContain("data-stop=");
    expect(html).not.toContain(">small wins</span>");
    expect(html).not.toContain(">day streak</span>");
  });
  it("provides a focused display preference without resetting unrelated choices", () => {
    const html = renderToStaticMarkup(createElement(GentleSetup, { initial: { displayName: "Sam", coachingTone: "direct", showStreak: false, setupStatus: "complete" }, progressOnly: true, onClose: () => {}, onSave: async () => {} }));
    expect(html).toContain("Progress, your way.");
    expect(html).toContain("Save display");
    expect(html).not.toContain("What should we call you?");
    expect(html).not.toContain("Skip for now");
    expect(html).not.toContain("Continue");
  });
});
