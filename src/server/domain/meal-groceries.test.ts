import { describe, expect, it } from "vitest";
import { canonicalIngredient, groceriesForMeals, ingredientLabel, parseIngredient } from "./meal-groceries";
import type { SavedLifeItem } from "./life-items";

describe("conservative ingredient quantities", () => {
  it("reads explicit fractions and compatible units without guessing ambiguous amounts", () => {
    expect(parseIngredient("1½ cups flour")).toEqual({ title: "flour", quantity: 1.5, unit: "cup" });
    expect(parseIngredient("1/2 kg rice")).toEqual({ title: "rice", quantity: 0.5, unit: "kg" });
    expect(canonicalIngredient(parseIngredient("1/2 kg rice"))).toEqual({ title: "rice", quantity: 500, unit: "g" });
    expect(parseIngredient("2 cloves garlic")).toEqual({ title: "garlic", quantity: 2, unit: "clove" });
    for (const title of ["Salt to taste", "1-2 lemons", "1 to 2 lemons", "2 x 400 g tomatoes", "1/0 cups flour"]) expect(parseIngredient(title)).toEqual({ title });
    expect(ingredientLabel({ title: "rice", quantity: 500, unit: "g" })).toBe("500 g rice");
  });
  it("scales compact known units while keeping ambiguous compact text intact", () => {
    expect(parseIngredient("500g rice")).toEqual({ title: "rice", quantity: 500, unit: "g" });
    expect(parseIngredient("1½cups flour")).toEqual({ title: "flour", quantity: 1.5, unit: "cup" });
    expect(parseIngredient("1/2kg rice")).toEqual({ title: "rice", quantity: 0.5, unit: "kg" });
    expect(parseIngredient("2tbsp. olive oil")).toEqual({ title: "olive oil", quantity: 2, unit: "tbsp" });
    for (const title of ["2lemons", "2x400 g tomatoes", "1-2kg rice", "1/0kg rice", "250mg salt", "1e3 g rice"]) expect(parseIngredient(title)).toEqual({ title });
  });
  it("formats shopping quantities without changing their stored precision", () => {
    const ingredient = { title: "onion", quantity: 0.666667, unit: "piece" as const };
    const original = structuredClone(ingredient);
    expect(ingredientLabel(ingredient)).toBe("about ⅔ onion");
    expect(ingredientLabel({ title: "carrots", quantity: 1.333333, unit: "piece" })).toBe("about 1⅓ carrots");
    expect(ingredientLabel({ title: "flour", quantity: 1.5, unit: "cup" })).toBe("1½ cups flour");
    expect(ingredientLabel({ title: "bread", quantity: 2, unit: "slice" })).toBe("2 slices bread");
    expect(ingredientLabel({ title: "bread", quantity: 1, unit: "slice" })).toBe("1 slice bread");
    expect(ingredientLabel({ title: "garlic", quantity: 2, unit: "clove" })).toBe("2 cloves garlic");
    expect(ingredientLabel({ title: "tomatoes", quantity: 266.666667, unit: "g" })).toBe("about 266.7 g tomatoes");
    expect(ingredientLabel({ title: "spice", quantity: 0.000001, unit: "g" })).toBe("0.000001 g spice");
    expect(ingredientLabel({ title: "rice", quantity: 0.2, unit: "cup" })).toBe("0.2 cups rice");
    expect(ingredientLabel({ title: "Salt to taste" })).toBe("Salt to taste");
    expect(ingredient).toEqual(original);
  });
  it("combines only matching names and compatible dimensions; explicit stock never guesses unknown amounts", () => {
    const meal: SavedLifeItem = { id: "00000000-0000-4000-8000-000000000091", version: 1, data: { kind: "meal", title: "Rice", date: "2027-01-14", meal: "Dinner", ingredients: "0.5 kg rice\n250 g RICE\n1 cup rice\nRice\nSalt to taste", servings: 4, ingredientServings: 2, groceriesEnabled: true } };
    const manual: SavedLifeItem = { id: "00000000-0000-4000-8000-000000000092", version: 1, data: { kind: "grocery", title: "Rice", checked: true } };
    const stock: SavedLifeItem = { id: "00000000-0000-4000-8000-000000000093", version: 1, data: { kind: "pantry", title: "rice", quantity: 0.5, unit: "kg" } };
    const result = [...groceriesForMeals([meal, manual, stock]).values()];
    expect(result.map(ingredientLabel)).toEqual(["1000 g rice", "2 cups rice", "Rice", "Salt to taste"]);
    expect(result[0].mealSources).toEqual([{ mealId: meal.id, quantity: 1500 }]);
    expect([...groceriesForMeals([meal, { ...stock, data: { kind: "pantry", title: "Rice" } }]).values()].map(ingredientLabel)).toEqual(["1500 g rice", "2 cups rice", "Rice", "Salt to taste"]);
  });
});
