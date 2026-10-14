import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoutineEditor, buildRoutineDraft, type RoutineDraft } from "./RoutineEditor";
import type { SavedLifeItem } from "../../server/domain/life-items";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const fresh = "00000000-0000-4000-8000-000000000003";
const item: SavedLifeItem = { id: "00000000-0000-4000-8000-000000000010", version: 3, data: { kind: "routine", title: "Morning", period: "morning", time: "08:00", steps: [{ id: first, title: "Water", minutes: 2, completedOn: "2026-10-14" }, { id: second, title: "Breakfast", minutes: 15, completedOn: null }] } };
function draft(): RoutineDraft { return { title: "Morning", period: "morning", time: "08:00", steps: [{ key: first, sourceId: first, title: "Water", minutes: "2" }, { key: second, sourceId: second, title: "Breakfast", minutes: "15" }] }; }

describe("routine conflict recovery", () => {
  const props = { item, timezone: "America/New_York", saving: false, onSave: async () => true, onClose: () => {}, onReload: () => {} };
  it("blocks a stale save and offers explicit reload without hiding the original draft", () => {
    const html = renderToStaticMarkup(createElement(RoutineEditor, { ...props, latestItem: { ...item, version: 4 } }));
    expect(html).toContain("changed elsewhere");
    expect(html).toContain("Discard my edits and load latest");
    expect(html).toContain('value="Breakfast"');
    expect(html).toMatch(/type="submit" disabled=""/);
  });
  it("does not recreate a routine deleted elsewhere", () => {
    const html = renderToStaticMarkup(createElement(RoutineEditor, props));
    expect(html).toContain("removed elsewhere");
    expect(html).not.toContain("Discard my edits and load latest");
    expect(html).toMatch(/type="submit" disabled=""/);
  });
  it("keeps saving available when the original version is current", () => {
    const html = renderToStaticMarkup(createElement(RoutineEditor, { ...props, latestItem: item }));
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/type="submit" disabled=""/);
  });
});

describe("routine editor draft", () => {
  it("preserves identities and completion history after reordering and duration edits", () => {
    const value = draft();
    value.steps.reverse();
    value.steps[1].minutes = "5";
    const result = buildRoutineDraft(value, item, () => { throw new Error("No new step expected"); });
    expect(result.steps).toEqual([{ id: second, title: "Breakfast", minutes: 15, completedOn: null }, { id: first, title: "Water", minutes: 5, completedOn: "2026-10-14" }]);
    expect(item.data.kind === "routine" && item.data.steps[0].minutes).toBe(2);
  });

  it("gives renamed and new steps new IDs without inheriting checkmarks", () => {
    const value = draft();
    value.steps[0].title = "Open curtains";
    value.steps.push({ key: "new", title: "Pack bag", minutes: "3" });
    let count = 2;
    const result = buildRoutineDraft(value, item, () => `00000000-0000-4000-8000-${String(++count).padStart(12, "0")}`);
    expect(result.steps[0]).toEqual({ id: fresh, title: "Open curtains", minutes: 2, completedOn: null });
    expect(result.steps[1].id).toBe(second);
    expect(result.steps[2].id).not.toBe(result.steps[0].id);
    expect(result.steps[2].completedOn).toBeNull();
  });

  it("does not duplicate an existing step identity if the draft repeats its reference", () => {
    const value = draft();
    value.steps = [value.steps[0], { ...value.steps[0], key: "copy" }];
    const result = buildRoutineDraft(value, item, () => fresh);
    expect(result.steps.map(step => step.id)).toEqual([first, fresh]);
    expect(result.steps[1].completedOn).toBeNull();
  });

  it.each(["", "0", "181", "2.5", "not minutes"])("rejects invalid minutes %j with a useful message", minutes => {
    const value = draft(); value.steps[0].minutes = minutes;
    expect(() => buildRoutineDraft(value, item)).toThrow("whole number from 1 to 180 minutes for step 1");
  });

  it("validates empty names, missing steps, too many steps, and invalid time", () => {
    expect(() => buildRoutineDraft({ ...draft(), title: " " }, item)).toThrow("Give your routine a name");
    expect(() => buildRoutineDraft({ ...draft(), time: "25:00" }, item)).toThrow("Choose a start time");
    expect(() => buildRoutineDraft({ ...draft(), steps: [] }, item)).toThrow("Add at least one step");
    expect(() => buildRoutineDraft({ ...draft(), steps: Array(31).fill(draft().steps[0]) }, item)).toThrow("30 steps or fewer");
    const value = draft(); value.steps[1].title = " ";
    expect(() => buildRoutineDraft(value, item)).toThrow("Give step 2 a name, or remove it");
  });

  it("accepts boundary durations and trims titles while preserving original identity", () => {
    const value = draft(); value.title = " Morning "; value.steps[0].title = " Water "; value.steps[0].minutes = "1"; value.steps[1].minutes = "180";
    const result = buildRoutineDraft(value, item);
    expect(result.title).toBe("Morning");
    expect(result.steps.map(step => step.minutes)).toEqual([1, 180]);
    expect(result.steps[0].id).toBe(first);
  });

  it("cannot overwrite a different kind of saved item", () => {
    expect(() => buildRoutineDraft(draft(), { ...item, data: { kind: "note", title: "Note", body: "Keep me" } })).toThrow("This item is not a routine");
  });
});
