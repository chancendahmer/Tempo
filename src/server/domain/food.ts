import { z } from "zod";

const value = z.number().finite().min(0).max(100000).nullable();
export const foodProductSchema = z.object({
  barcode: z.string().regex(/^\d{8,14}$/), title: z.string().max(240), brand: z.string().max(300),
  serving: z.string().max(100), basis: z.enum(["g", "ml", "unknown"]),
  per100: z.object({ calories: value, protein: value, carbs: value, fat: value, fiber: value }),
});
export type FoodProduct = z.infer<typeof foodProductSchema>;
export function scaleFood(product: FoodProduct, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) throw new Error("Choose an amount between 0 and 10,000.");
  return Object.fromEntries(Object.entries(product.per100).map(([key, n]) => [key, n === null ? null : Math.round(n * amount) / 100])) as FoodProduct["per100"];
}
