import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LifeItem, SavedLifeItem } from "../../server/domain/life-items";
import { FoodViews } from "./FoodViews";

const saved = (id: string, data: LifeItem): SavedLifeItem => ({ id, version: 1, data });
const meal = saved("meal", { kind: "meal", title: "Rice bowl", date: "2026-10-15", meal: "Dinner", ingredients: "200 g rice", ingredientServings: 2, servings: 4, groceriesEnabled: true });
const recipe = (id: string, length: number) => saved(id, { kind: "recipe", title: id, ingredients: `${"a".repeat(99)}\n`.repeat(Math.floor(length / 100)) + "a".repeat(length % 100), instructions: "Prepare", servings: 2, prepMinutes: 10, favorite: true });
const props = { date: "2026-10-15", today: "2026-10-15", setDate: () => {}, saving: false, edit: () => {}, plan: () => {}, actions: (item: SavedLifeItem) => createElement("span", null, `Edit ${item.id}`), save: async () => true, ask: () => {} };

describe("meal and shopping views", () => {
  it("prevents swapping in an oversized recipe while leaving a supported recipe available", () => {
    const html = renderToStaticMarkup(createElement(FoodViews, { ...props, tab: "plan", items: [meal, recipe("Long recipe", 4001), recipe("Supported recipe", 4000)] }));
    expect(html).toMatch(/<option[^>]*value="Long recipe"[^>]*disabled=""[^>]*>Long recipe · shorten ingredient list first<\/option>/);
    expect(html).toContain('<option value="Supported recipe">Supported recipe</option>');
    expect(html).toContain("Preparing 4 servings");
    expect(html).toContain("Listed for 2 servings");
    expect(html).toContain("It doesn’t log food as eaten");
    expect(html).toContain("200 g rice");
  });

  it("keeps purchased groceries separate from pantry and directs derived edits to the source meal", () => {
    const grocery = saved("derived", { kind: "grocery", title: "rice", quantity: 300, unit: "g", checked: true, mealSources: [{ mealId: meal.id, quantity: 400 }] });
    const pantry = saved("pantry", { kind: "pantry", title: "rice", quantity: 100, unit: "g" });
    const manual = saved("manual", { kind: "grocery", title: "Lemons", checked: false });
    const html = renderToStaticMarkup(createElement(FoodViews, { ...props, tab: "groceries", items: [meal, grocery, pantry, manual] }));
    expect(html).toContain("Purchased · not added to pantry");
    expect(html).toContain("300 g rice");
    expect(html).toContain("100 g rice");
    expect(html).toContain("Rice bowl · 2026-10-15");
    expect(html).not.toContain("Edit derived");
    expect(html).toContain("Edit pantry");
    expect(html).toContain("Edit manual");
    expect(html.indexOf("Lemons")).toBeLessThan(html.indexOf("300 g rice"));
  });
});
