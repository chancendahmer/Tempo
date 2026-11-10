import type { LifeItem } from "./life-items";

export const nutrientKeys = ["calories", "protein", "carbs", "fat", "fiber"] as const;
type Nutrient = typeof nutrientKeys[number];
type Nutrients = Pick<Extract<LifeItem, { kind: "food" }>, Nutrient>;

/** Report a missing total as unknown; partial totals keep their missing count. */
export function nutritionTotals(foods: readonly { data: Nutrients }[]) {
  return Object.fromEntries(nutrientKeys.map(key => {
    const known = foods.filter(item => item.data[key] !== null);
    return [key, { value: known.length ? known.reduce((sum, item) => sum + item.data[key]!, 0) : null, missing: foods.length - known.length }];
  })) as Record<Nutrient, { value: number | null; missing: number }>;
}
