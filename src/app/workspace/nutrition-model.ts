import { lifeItemSchema, type LifeItem, type SavedLifeItem } from "../../server/domain/life-items";
import { scaleFood, type FoodProduct } from "../../server/domain/food";

export type FoodEntry = Extract<LifeItem, { kind: "food" }>;
export type SavedFood = SavedLifeItem & { data: FoodEntry };
export const nutrientKeys = ["calories", "protein", "carbs", "fat", "fiber"] as const;
export const meals = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
export const isFood = (item: SavedLifeItem): item is SavedFood => item.data.kind === "food";
export const nutrientLabel = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

export function catalogFoodEntry(product: FoodProduct, portion: { amount: number; unit: "g" | "ml"; date: string; meal: FoodEntry["meal"]; favorite: boolean }): FoodEntry {
  const result = lifeItemSchema.safeParse({ kind: "food", title: product.title, ...portion, ...scaleFood(product, portion.amount), barcode: product.barcode, source: "openfoodfacts" });
  if (!result.success) {
    const oversized = result.error.issues.some(issue => issue.code === "too_big" && nutrientKeys.some(key => key === issue.path[0]));
    throw new Error(oversized
      ? "This portion exceeds the 10,000 limit for a calorie or nutrient value. Check the package label and reduce the portion, or add the correct label values manually. Your entered amount is still here."
      : "Check the food name, date, and portion, or add the label values manually.");
  }
  return result.data as FoodEntry;
}

/** Report a missing total as unknown; partial totals keep their missing count. */
export function nutritionTotals(foods: SavedFood[]) {
  return Object.fromEntries(nutrientKeys.map(key => {
    const known = foods.filter(item => item.data[key] !== null);
    return [key, { value: known.length ? known.reduce((sum, item) => sum + item.data[key]!, 0) : null, missing: foods.length - known.length }];
  })) as Record<typeof nutrientKeys[number], { value: number | null; missing: number }>;
}

export function repeatFood(food: FoodEntry, date: string, meal: FoodEntry["meal"], multiplier = 1): FoodEntry {
  if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 100) throw new Error("Choose a portion multiplier above 0 and at most 100.");
  const nutrients = Object.fromEntries(nutrientKeys.map(key => [key, food[key] === null ? null : Math.round(food[key]! * multiplier * 100) / 100]));
  const result = lifeItemSchema.safeParse({ ...food, ...nutrients, date, meal, ...(food.amount ? { amount: food.amount * multiplier } : {}), favorite: false });
  if (!result.success) throw new Error("That portion is too large. Reduce it and try again.");
  return result.data as FoodEntry;
}

/** A repeated portion should not crowd out other recent foods. */
export function recentFoods(items: SavedLifeItem[], favoritesOnly = false) {
  const seen = new Set<string>();
  return items.filter(isFood).filter(item => !favoritesOnly || item.data.favorite).sort((a, b) => b.data.date.localeCompare(a.data.date)).filter(item => {
    const key = JSON.stringify([item.data.barcode ?? item.data.title.toLowerCase(), item.data.amount, item.data.unit, ...nutrientKeys.map(n => item.data[n])]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 30);
}
