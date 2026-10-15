import type { LifeItem, SavedLifeItem } from "./life-items";

type Grocery = Extract<LifeItem, { kind: "grocery" }>;
type Unit = NonNullable<Grocery["unit"]>;
export type Ingredient = { title: string; quantity?: number; unit?: Unit };
export class IngredientInputError extends Error {}
const aliases: Record<string, Unit> = { g: "g", gram: "g", grams: "g", kg: "kg", kilogram: "kg", kilograms: "kg", ml: "ml", milliliter: "ml", milliliters: "ml", l: "l", liter: "l", liters: "l", tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp", tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", cup: "cup", cups: "cup", oz: "oz", ounce: "oz", ounces: "oz", lb: "lb", pound: "lb", pounds: "lb", piece: "piece", pieces: "piece", slice: "slice", slices: "slice", clove: "clove", cloves: "clove", can: "can", cans: "can", package: "package", packages: "package" };
const unicodeFractions: Record<string, string> = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };
export const normalizeIngredient = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

/** Parse only an explicit leading amount. Preserve unfamiliar/ranged text verbatim. */
export function parseIngredient(line: string): Ingredient {
  const title = line.trim().replace(/^[-•]\s*/, "").replace(/\s+/g, " ");
  if (!title || title.length > 240) throw new IngredientInputError("Use one ingredient per line, with each ingredient under 240 characters.");
  const expanded = title.replace(/(\d)([½¼¾⅓⅔⅛⅜⅝⅞])/g, "$1 $2").replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, value => unicodeFractions[value]);
  const match = /^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s+(.+)$/.exec(expanded);
  if (!match) return { title };
  const amount = match[1].split(" ").reduce((sum, token) => {
    const fraction = token.split("/").map(Number);
    return sum + (fraction.length === 2 ? fraction[0] / fraction[1] : fraction[0]);
  }, 0);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) return { title };
  const words = match[2].split(" "), unit = aliases[words[0].toLowerCase().replace(/\.$/, "")];
  const name = unit ? words.slice(1).join(" ") : match[2];
  // A range or multiplication is not an unlabelled item count.
  if (!name || /^(?:[-–—x×]|to\b|\d)/i.test(name)) return { title };
  return { title: name, quantity: amount, unit: unit ?? "piece" };
}

export function canonicalIngredient(item: Ingredient): Ingredient {
  const multiplier = item.unit === "kg" || item.unit === "l" ? 1000 : item.unit === "lb" ? 16 : item.unit === "tbsp" ? 3 : 1;
  const unit = item.unit === "kg" ? "g" : item.unit === "l" ? "ml" : item.unit === "lb" ? "oz" : item.unit === "tbsp" ? "tsp" : item.unit;
  return { title: item.title.trim().replace(/\s+/g, " "), ...(item.quantity === undefined ? {} : { quantity: item.quantity * multiplier }), ...(unit ? { unit } : {}) };
}
export const ingredientKey = (item: Ingredient) => `${normalizeIngredient(item.title)}|${item.quantity === undefined ? "unknown" : item.unit ?? "piece"}`;
export function ingredientLabel(item: Ingredient) {
  return `${item.quantity === undefined ? "" : `${Number(item.quantity.toFixed(3))}${item.unit && item.unit !== "piece" ? ` ${item.unit}` : ""} `}${item.title}`;
}

/** Manual groceries and purchase checkboxes are never treated as pantry stock. */
export function groceriesForMeals(items: SavedLifeItem[], fromDate?: string): Map<string, Grocery> {
  const result = new Map<string, Grocery>();
  for (const item of items) {
    if (item.data.kind !== "meal" || item.data.groceriesEnabled !== true) continue;
    if (fromDate && item.data.date < fromDate) continue;
    const meal = item.data, ratio = (meal.servings ?? meal.ingredientServings ?? 1) / (meal.ingredientServings ?? meal.servings ?? 1);
    for (const line of meal.ingredients.split(/\r?\n|;/).filter(line => line.trim())) {
      const ingredient = canonicalIngredient(parseIngredient(line));
      if (ingredient.quantity !== undefined) ingredient.quantity *= ratio;
      const key = ingredientKey(ingredient), prior = result.get(key);
      if (prior) {
        if (ingredient.quantity !== undefined) prior.quantity = (prior.quantity ?? 0) + ingredient.quantity;
        const source = prior.mealSources!.find(source => source.mealId === item.id);
        if (source && source.quantity !== null && ingredient.quantity !== undefined) source.quantity += ingredient.quantity;
        else if (!source) prior.mealSources!.push({ mealId: item.id, quantity: ingredient.quantity ?? null });
      } else result.set(key, { kind: "grocery", ...ingredient, checked: false, mealSources: [{ mealId: item.id, quantity: ingredient.quantity ?? null }] });
    }
  }
  for (const item of items) {
    if (item.data.kind !== "pantry") continue;
    const stock = canonicalIngredient(item.data), key = ingredientKey(stock), need = result.get(key);
    if (!need) continue;
    if (stock.quantity !== undefined && need.quantity !== undefined) {
      need.quantity = Math.max(0, need.quantity - stock.quantity);
      if (need.quantity < 0.000001) result.delete(key);
    }
  }
  for (const item of result.values()) {
    if (item.quantity !== undefined) {
      item.quantity = Math.round(item.quantity * 1000000) / 1000000;
      if (item.quantity <= 0 || item.quantity > 1000000000) throw new IngredientInputError("That ingredient amount is outside the supported range. Check its amount and units.");
    }
    if (item.mealSources!.length > 1000) throw new IngredientInputError("Too many meals contribute to this ingredient. Turn off shopping for older meal plans first.");
    item.mealSources!.sort((a, b) => a.mealId.localeCompare(b.mealId));
  }
  return result;
}
