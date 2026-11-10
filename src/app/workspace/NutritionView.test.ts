import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SavedLifeItem } from "../../server/domain/life-items";
import type { FoodEntry } from "./nutrition-model";
import { NutritionView } from "./NutritionView";

const food = (id: string, overrides: Partial<FoodEntry> = {}): SavedLifeItem => ({ id, version: 1, data: { kind: "food", title: id, date: "2026-10-19", meal: "Breakfast", calories: 120, protein: 5, carbs: 15, fat: 4, fiber: 2, source: "manual", ...overrides } });
const render = (items: SavedLifeItem[], incomplete = false) => renderToStaticMarkup(createElement(NutritionView, { items, date: "2026-10-19", today: "2026-10-19", setDate: () => {}, saving: false, preview: false, incomplete, save: async () => true, remove: () => {} }));

describe("nutrition diary summaries", () => {
  it("labels partial meal totals and keeps other dates out of the selected diary", () => {
    const html = render([food("Toast"), food("Unknown portion", { calories: null, protein: null, carbs: null, fat: null, fiber: null }), food("Yesterday", { date: "2026-10-18" })]);
    expect(html).toContain("2 entries · 120 kcal · partial");
    expect(html).toContain('aria-label="Breakfast macro totals"');
    expect(html).toContain("1 unknown · partial total");
    expect(html).not.toContain("Yesterday");
  });

  it("shows unknown nutrition without inventing zero or remaining calories", () => {
    const html = render([food("Unmeasured meal", { calories: null, protein: null, carbs: null, fat: null, fiber: null })]);
    expect(html).toContain("1 entry · Calories unknown");
    expect(html).toContain("<strong>Unknown</strong>");
    expect(html).toContain("Calories unknown · Protein unknown · Carbs unknown · Fat unknown");
    expect(html).not.toContain("1 unknown · partial total");
    expect(html).toContain("No daily target");
    expect(html).not.toContain("kcal remaining");
    expect(html).not.toContain("0 g</strong>");
  });

  it("preserves known zero and distinguishes an empty diary from logged unknown values", () => {
    const zero = render([food("Tea", { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })]);
    expect(zero).toContain("0 kcal · 0 g protein · 0 g carbs · 0 g fat");
    expect(zero).not.toContain("Calories unknown");
    const empty = render([]);
    expect(empty).toContain("Nothing logged yet");
    expect(empty).not.toContain("<strong>Unknown</strong>");
  });

  it("does not show exact remaining calories or target progress when the diary coverage is incomplete", () => {
    const target: SavedLifeItem = { id: "target", version: 1, data: { kind: "nutrition_target", title: "Targets", calories: 2000, carbs: 150, fat: 50, protein: 80, fiber: null } };
    const items = [food("Toast"), target];
    const complete = render(items);
    expect(complete).toContain("kcal remaining");
    expect(complete).toContain("<progress");
    const incomplete = render(items, true);
    expect(incomplete).toContain("Loaded entries only");
    expect(incomplete).toContain("120");
    expect(incomplete).not.toContain("kcal remaining");
    expect(incomplete).not.toContain("<progress");
    const partial = render([...items, food("Unmeasured side", { carbs: null, calories: null })]);
    expect(partial).toContain('aria-label="carbs: 15 of 150 target · partial total"');
    expect(partial).not.toContain("kcal remaining");
  });
});
