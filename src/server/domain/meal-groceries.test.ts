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
  it("combines only matching names and compatible dimensions; explicit stock never guesses unknown amounts", () => {
    const meal: SavedLifeItem = { id: "00000000-0000-4000-8000-000000000091", version: 1, data: { kind: "meal", title: "Rice", date: "2027-01-14", meal: "Dinner", ingredients: "0.5 kg rice\n250 g RICE\n1 cup rice\nRice\nSalt to taste", servings: 4, ingredientServings: 2, groceriesEnabled: true } };
    const manual: SavedLifeItem = { id: "00000000-0000-4000-8000-000000000092", version: 1, data: { kind: "grocery", title: "Rice", checked: true } };
    const stock: SavedLifeItem = { id: "00000000-0000-4000-8000-000000000093", version: 1, data: { kind: "pantry", title: "rice", quantity: 0.5, unit: "kg" } };
    const result = [...groceriesForMeals([meal, manual, stock]).values()];
    expect(result.map(ingredientLabel)).toEqual(["1000 g rice", "2 cup rice", "Rice", "Salt to taste"]);
    expect(result[0].mealSources).toEqual([{ mealId: meal.id, quantity: 1500 }]);
    expect([...groceriesForMeals([meal, { ...stock, data: { kind: "pantry", title: "Rice" } }]).values()].map(ingredientLabel)).toEqual(["1500 g rice", "2 cup rice", "Rice", "Salt to taste"]);
  });
});
