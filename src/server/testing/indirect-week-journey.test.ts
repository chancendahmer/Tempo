import { describe, expect, it } from "vitest";
import { indirectWeekJourney } from "../../../scripts/lib/indirect-week-journey";
import type { WeekStep } from "../../../scripts/lib/week-journey";

type Context = Parameters<NonNullable<WeekStep["expectation"]>>[0];
function context(): Context {
  const workspace = { items: [], tasks: [], goals: [], reminders: [], profile: {}, calendar: null, busy: [] };
  return { before: structuredClone(workspace), after: structuredClone(workspace), turn: { replies: ["Try telling me one thing you need help with."] }, simulator: { calendarWrites: [] }, user: { id: "demo" } } as unknown as Context;
}

describe("indirect journey acceptance checks", () => {
  it("rejects an unsolicited mutation during advice", async () => {
    const input = context();
    input.after.items.push({ id: "unsolicited", version: 1, data: { kind: "note", title: "Advice", body: "Unexpected save" } });
    expect(await indirectWeekJourney[0].expectation!(input)).toContain("Unexpected items mutation.");
  });
  it("fails a missing correction prerequisite instead of passing unchanged empty state", async () => {
    expect(await indirectWeekJourney[5].expectation!(context())).not.toEqual([]);
  });
  it("requires recipe identity and unrelated fields to survive a servings correction", async () => {
    const input = context();
    const row = { id: "recipe", version: 1, data: { kind: "recipe" as const, title: "Lemon rice", servings: 2, prepMinutes: 20, ingredients: "Rice and lemon", instructions: "Cook rice, stir lemon in", favorite: true } };
    input.before.items = [row];
    input.after.items = [{ ...row, version: 2, data: { ...row.data, servings: 4 } }];
    expect(await indirectWeekJourney[5].expectation!(input)).toEqual([]);
    input.after.items[0].id = "duplicate";
    expect(await indirectWeekJourney[5].expectation!(input)).not.toEqual([]);
  });
  it("records malformed calendar confirmation as a failure rather than aborting the report", async () => {
    const input = context();
    input.simulator.calendarWrites.push({ userId: "demo", change: { operation: "update", eventId: "fixture-dentist", start: "bad date", end: "bad date" } });
    expect(await indirectWeekJourney[17].expectation!(input)).toContain("Confirmed calendar edit has wrong account, event, or time.");
  });
});

