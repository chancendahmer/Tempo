import { describe, expect, it } from "vitest";
import { calculateActivityStreak } from "./activity-streak";

describe("saved activity streak", () => {
  it("keeps earned journey days across gaps, without double-counting duplicate checkoffs", () => {
    const summary = calculateActivityStreak([
      { key: "one", date: "2026-10-01" }, { key: "one", date: "2026-10-01" },
      { key: "two", date: "2026-10-01" }, { key: "one", date: "2026-10-02" },
      { key: "one", date: "2026-10-15" },
    ], "UTC", new Date("2026-10-19T12:00:00Z"));
    expect(summary).toMatchObject({ currentDays: 0, totalActiveDays: 3, totalCompletions: 4, bestDays: 2 });
  });

  it("starts with honest zeroes and seven empty local days", () => {
    const summary = calculateActivityStreak([], "Pacific/Kiritimati", new Date("2026-10-18T12:15:00Z"));
    expect(summary).toMatchObject({ currentDays: 0, activeToday: false, completedToday: 0, latestActivityDay: null });
    expect(summary.recentDays.map(day => day.date)).toEqual(["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]);
    expect(summary.recentDays.every(day => !day.active && day.completed === 0)).toBe(true);
  });

  it("uses the account's midnight and deduplicates retries and same-day recompletions", () => {
    const now = new Date("2026-10-19T04:15:00Z");
    const completions = [
      { key: "task:one", completedAt: new Date("2026-10-19T03:59:00Z") },
      { key: "task:two", completedAt: new Date("2026-10-19T04:01:00Z") },
      { key: "task:two", completedAt: new Date("2026-10-19T04:02:00Z") },
      { key: "routine:one", date: "2026-10-19" },
      { key: "routine:one", date: "2026-10-19" },
    ];
    expect(calculateActivityStreak(completions, "America/New_York", now)).toMatchObject({ currentDays: 2, activeToday: true, completedToday: 2 });
    expect(calculateActivityStreak(completions, "UTC", now)).toMatchObject({ currentDays: 1, completedToday: 3 });
  });

  it("keeps yesterday's streak available today and welcomes a return after a full missed day", () => {
    const completions = ["2026-10-16", "2026-10-17"].map(date => ({ key: "routine:one", date }));
    expect(calculateActivityStreak(completions, "UTC", new Date("2026-10-18T23:59:59Z"))).toMatchObject({ currentDays: 2, activeToday: false });
    expect(calculateActivityStreak(completions, "UTC", new Date("2026-10-19T00:00:00Z"))).toMatchObject({ currentDays: 0, latestActivityDay: "2026-10-17" });
    expect(calculateActivityStreak([...completions, { key: "task:new", date: "2026-10-19" }], "UTC", new Date("2026-10-19T12:00:00Z"))).toMatchObject({ currentDays: 1, activeToday: true });
  });

  it.each([
    { now: "2026-03-09T04:05:00Z", dates: ["2026-03-07", "2026-03-08", "2026-03-09"] },
    { now: "2026-11-02T05:05:00Z", dates: ["2026-10-31", "2026-11-01", "2026-11-02"] },
    { now: "2028-03-01T05:05:00Z", dates: ["2028-02-28", "2028-02-29", "2028-03-01"] },
    { now: "2027-01-01T05:05:00Z", dates: ["2026-12-30", "2026-12-31", "2027-01-01"] },
  ])("counts calendar days across DST, leap day and year boundaries: $now", ({ now, dates }) => {
    expect(calculateActivityStreak(dates.map(date => ({ key: "routine:one", date })), "America/New_York", new Date(now)).currentDays).toBe(3);
  });

  it("ignores invalid and future records without filling a gap", () => {
    const summary = calculateActivityStreak([
      { key: "old", date: "2026-02-27" },
      { key: "invalid", date: "2026-02-30" },
      { key: "future", date: "2026-03-02" },
      { key: "later-today", completedAt: new Date("2026-03-01T23:00:00Z") },
      { key: "invalid-time", completedAt: new Date("bad") },
    ], "UTC", new Date("2026-03-01T12:00:00Z"));
    expect(summary).toMatchObject({ currentDays: 0, completedToday: 0, latestActivityDay: "2026-02-27" });
  });
});
