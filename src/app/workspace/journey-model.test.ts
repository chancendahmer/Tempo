import { describe, expect, it } from "vitest";
import { dailyEncouragement, journeyProgress, journeySwipe } from "./journey-model";

describe("journey progression", () => {
  it("starts honestly and reaches milestones only on their recorded day thresholds", () => {
    expect(journeyProgress(0)).toMatchObject({ level: 1, remaining: 3, percent: 0 });
    expect(journeyProgress(2)).toMatchObject({ level: 1, remaining: 1, percent: 67 });
    expect(journeyProgress(3)).toMatchObject({ level: 2, remaining: 4, percent: 0 });
    expect(journeyProgress(7)).toMatchObject({ level: 3, remaining: 7 });
    expect(journeyProgress(14)).toMatchObject({ level: 4, remaining: 16 });
    expect(journeyProgress(30)).toMatchObject({ level: 5, remaining: 30 });
    expect(journeyProgress(90)).toMatchObject({ level: 6, earnedDays: 90, percent: 100, remaining: 0 });
  });
  it("does not display negative or invalid progress", () => {
    for (const days of [-10, NaN, Infinity]) expect(journeyProgress(days)).toMatchObject({ level: 1, earnedDays: 0 });
  });
  it("keeps the daily message stable for the account day, including a timezone boundary", () => {
    expect(dailyEncouragement(new Date("2026-10-19T03:59:00Z"), "America/New_York")).toBe(dailyEncouragement(new Date("2026-10-18T12:00:00Z"), "America/New_York"));
    expect(dailyEncouragement(new Date("2026-10-19T04:00:00Z"), "America/New_York")).not.toBe(dailyEncouragement(new Date("2026-10-19T03:59:00Z"), "America/New_York"));
  });
  it("only navigates for an intentional horizontal swipe", () => {
    const start = { x: 200, y: 200 };
    expect(journeySwipe(start, { x: 100, y: 210 })).toBe("journey");
    expect(journeySwipe(start, { x: 300, y: 190 })).toBe("today");
    expect(journeySwipe(start, { x: 230, y: 200 })).toBe(null);
    expect(journeySwipe(start, { x: 100, y: 320 })).toBe(null);
    expect(journeySwipe(start, { x: 200, y: 500 })).toBe(null);
  });
});
