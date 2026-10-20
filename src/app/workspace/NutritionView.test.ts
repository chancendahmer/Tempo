import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SavedLifeItem } from "../../server/domain/life-items";
import type { FoodEntry } from "./nutrition-model";
import { NutritionView } from "./NutritionView";

const food = (id: string, overrides: Partial<FoodEntry> = {}): SavedLifeItem => ({ id, version: 1, data: { kind: "food", title: id, date: "2026-10-19", meal: "Breakfast", calories: 120, protein: 5, carbs: 15, fat: 4, fiber: 2, source: "manual", ...overrides } });
const render = (items: SavedLifeItem[]) => renderToStaticMarkup(createElement(NutritionView, { items, date: "2026-10-19", today: "2026-10-19", setDate: () => {}, saving: false, preview: false, save: async () => true, remove: () => {} }));

describe("nutrition diary summaries", () => {
  it("labels partial meal totals and keeps other dates out of the selected diary", () => {
    const html = render([food("Toast"), food("Unknown portion", { calories: null, protein: null, carbs: null, fat: null, fiber: null }), food("Yesterday", { date: "2026-10-18" })]);
    expect(html).toContain("2 entries · 120 kcal · partial");
    expect(html).toContain('aria-label="Breakfast macro totals"');
    expect(html).toContain("1 unknown");
    expect(html).not.toContain("Yesterday");
  });

  it("shows unknown nutrition without inventing zero or remaining calories", () => {
    const html = render([food("Unmeasured meal", { calories: null, protein: null, carbs: null, fat: null, fiber: null })]);
    expect(html).toContain("1 entry · — kcal · partial");
    expect(html).toContain("No daily target");
    expect(html).not.toContain("kcal remaining");
    expect(html).not.toContain("0 g</strong>");
  });
});
