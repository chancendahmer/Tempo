import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildFoodEntry, FoodEntryEditor, type FoodDraft } from "./FoodEntryEditor";
import { buildNutritionTarget } from "./NutritionTargetEditor";
import { NutritionView } from "./NutritionView";
import { catalogFoodEntry, nutritionTotals, recentFoods, repeatFood, type FoodEntry, type SavedFood } from "./nutrition-model";

const food: FoodEntry = { kind: "food", title: "Plain yogurt", date: "2026-10-14", meal: "Breakfast", calories: 120, protein: 10, carbs: null, fat: 4, fiber: null, amount: 150, unit: "g", source: "openfoodfacts", barcode: "12345678", favorite: true };
const saved = (data: FoodEntry, id = "food-1"): SavedFood => ({ id, version: 1, data });
const draft: FoodDraft = { title: food.title, date: food.date, meal: food.meal, amount: "150", unit: "g", favorite: true, calories: "120", protein: "10", carbs: "", fat: "4", fiber: "" };

describe("nutrition diary data", () => {
  it("explains oversized catalog portions without changing the draft and accepts a corrected portion", () => {
    const product = { barcode: "12345678", title: "Oil", brand: "", serving: "", basis: "g" as const, per100: { calories: 900, protein: null, carbs: null, fat: 100, fiber: null } };
    const portion = { date: food.date, meal: food.meal, amount: 2000, unit: "g" as const, favorite: true };
    const original = structuredClone({ product, portion });
    expect(() => catalogFoodEntry(product, portion)).toThrow("Check the package label and reduce the portion");
    expect({ product, portion }).toEqual(original);
    expect(catalogFoodEntry(product, { ...portion, amount: 10 })).toMatchObject({ calories: 90, fat: 10, protein: null, amount: 10, barcode: product.barcode, source: "openfoodfacts", favorite: true });
    expect(catalogFoodEntry({ ...product, per100: { ...product.per100, calories: 10000 } }, { ...portion, amount: 100 }).calories).toBe(10000);
    expect(() => catalogFoodEntry(product, { ...portion, amount: 10, date: "invalid" })).toThrow("Check the food name, date, and portion");
  });

  it("keeps entirely unknown and empty totals unknown, while counting partial totals", () => {
    expect(nutritionTotals([]).calories).toEqual({ value: null, missing: 0 });
    expect(nutritionTotals([saved(food)]).carbs).toEqual({ value: null, missing: 1 });
    expect(nutritionTotals([saved(food), saved({ ...food, calories: null })]).calories).toEqual({ value: 120, missing: 1 });
    expect(nutritionTotals([saved({ ...food, calories: 0 })]).calories.value).toBe(0);
  });
  it("copies only to the requested meal and date, scales known values, and preserves source metadata", () => {
    const result = repeatFood(food, "2026-10-15", "Lunch", 0.5);
    expect(result).toMatchObject({ date: "2026-10-15", meal: "Lunch", calories: 60, protein: 5, carbs: null, amount: 75, unit: "g", barcode: food.barcode, source: "openfoodfacts", favorite: false });
    expect(food.amount).toBe(150);
    for (const scale of [0, -1, NaN, Infinity, 101]) expect(() => repeatFood(food, food.date, food.meal, scale)).toThrow();
    expect(() => repeatFood({ ...food, calories: 9999 }, food.date, food.meal, 2)).toThrow("too large");
  });
  it("keeps distinct portions in recent foods, deduplicates repeats, and finds older favorites", () => {
    const older = saved(food, "older");
    const newer = saved({ ...food, date: "2026-10-15", favorite: false }, "newer");
    const smaller = saved({ ...food, amount: 75, calories: 60 }, "smaller");
    const entries = [older, newer, smaller];
    expect(recentFoods(entries).map(item => item.id)).toEqual(["newer", "smaller"]);
    expect(recentFoods(entries, true).map(item => item.id)).toEqual(["older", "smaller"]);
    expect(entries[0]).toBe(older);
  });
  it("preserves the barcode and source when a manual edit updates a logged portion", () => {
    expect(buildFoodEntry({ ...draft, calories: "135.5" }, food)).toMatchObject({ calories: 135.5, barcode: food.barcode, source: "openfoodfacts", amount: 150, unit: "g", carbs: null, favorite: true });
    expect(buildFoodEntry({ ...draft, amount: "" }, food).amount).toBeUndefined();
    expect(buildFoodEntry(draft).source).toBe("manual");
    for (const calories of ["-1", "10001", "bad", "Infinity"]) expect(() => buildFoodEntry({ ...draft, calories }, food)).toThrow();
  });
  it("accepts user targets without supplying invented defaults and allows clearing targets", () => {
    expect(buildNutritionTarget({ calories: "2100", protein: "90", carbs: "", fat: "", fiber: "" })).toMatchObject({ calories: 2100, protein: 90, carbs: null, fat: null, fiber: null });
    expect(buildNutritionTarget({ calories: "", protein: "", carbs: "", fat: "", fiber: "" }).calories).toBeNull();
    expect(() => buildNutritionTarget({ calories: "NaN", protein: "", carbs: "", fat: "", fiber: "" })).toThrow();
  });
});

describe("nutrition UI truthfulness and conflict handling", () => {
  it("shows remaining calories only for complete known intake and an explicit target", () => {
    const target = { id: "target", version: 1, data: buildNutritionTarget({ calories: "200", protein: "", carbs: "", fat: "", fiber: "" }) };
    const render = (items: Parameters<typeof NutritionView>[0]["items"]) => renderToStaticMarkup(createElement(NutritionView, { items, date: food.date, today: food.date, setDate: () => {}, saving: false, preview: false, save: async () => true, remove: () => {} }));
    const complete = render([saved(food), target]);
    expect(complete).toContain("80 kcal remaining");
    expect(complete).toContain('aria-label="Calories: 120 of 200 target"');
    const partial = render([saved(food), saved({ ...food, calories: null }, "unknown"), target]);
    expect(partial).toContain("Remaining unknown");
    expect(partial).not.toContain("80 kcal remaining");
    const noTarget = render([saved(food)]);
    expect(noTarget).toContain("No daily target");
    expect(noTarget).not.toContain("<progress");
    const zeroTarget = { ...target, data: { ...target.data, calories: 0 } };
    expect(render([saved({ ...food, calories: 0 }), zeroTarget])).toContain("0 kcal remaining");
    expect(render([saved(food), zeroTarget])).toContain("120 kcal over target");
    expect(render([saved(food), zeroTarget])).not.toContain("<progress");
  });

  it("credits saved and copied catalog entries only when they appear on the selected day", () => {
    const render = (items: SavedFood[], date = food.date) => renderToStaticMarkup(createElement(NutritionView, { items, date, today: food.date, setDate: () => {}, saving: false, preview: false, save: async () => true, remove: () => {} }));
    for (const html of [render([saved(food)]), render([saved(repeatFood(food, "2026-10-15", "Lunch"))], "2026-10-15")]) {
      expect(html).toContain('href="https://world.openfoodfacts.org"');
      expect(html).toContain('href="https://opendatacommons.org/licenses/odbl/1-0/"');
    }
    expect(render([saved({ ...food, source: "manual" })])).not.toContain("Includes data from");
    expect(render([saved(food)], "2026-10-15")).not.toContain("Includes data from");
  });

  it("renders missing calories as unknown and marks partial nutrients", () => {
    const unknown = saved({ ...food, calories: null, protein: null });
    const html = renderToStaticMarkup(createElement(NutritionView, { items: [unknown], date: food.date, today: food.date, setDate: () => {}, saving: false, preview: false, save: async () => true, remove: () => {} }));
    expect(html).toContain("1 entry has unknown calories");
    expect(html).toContain("—");
    expect(html).not.toContain("0</strong><span>kcal logged");
    expect(html).toContain("Daily targets");
  });
  it("blocks stale edits so metadata cannot overwrite a refreshed entry", () => {
    const item = saved(food);
    const html = renderToStaticMarkup(createElement(FoodEntryEditor, { date: food.date, item, latestItem: { ...item, version: 2 }, saving: false, save: async () => true, close: () => {} }));
    expect(html).toContain("changed or was removed elsewhere");
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
  });
});
