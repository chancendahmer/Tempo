import { z } from "zod";
import { foodProductSchema, FoodProduct } from "../../domain/food";

const rawProduct = z.object({ code: z.union([z.string(), z.number()]).optional(), product_name: z.string().optional(), brands: z.string().optional(), serving_size: z.string().optional(), product_quantity_unit: z.string().optional(), nutrition_data_per: z.string().optional(), nutriments: z.record(z.string(), z.unknown()).optional() }).passthrough();
export function normalizeFood(raw: unknown): FoodProduct | null {
  const parsed = rawProduct.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data, n = p.nutriments ?? {};
  const read = (key: string) => typeof n[key] === "number" && Number.isFinite(n[key]) && n[key] >= 0 ? n[key] as number : null;
  const kcal = read("energy-kcal_100g"), kj = read("energy-kj_100g") ?? read("energy_100g");
  const unit = p.product_quantity_unit?.toLowerCase();
  const result = foodProductSchema.safeParse({ barcode: String(p.code ?? ""), title: (p.product_name || "Unnamed product").slice(0, 240), brand: (p.brands ?? "").slice(0, 300), serving: (p.serving_size ?? "").slice(0, 100), basis: unit === "ml" || unit === "l" ? "ml" : unit === "g" || unit === "kg" ? "g" : "unknown", per100: { calories: kcal ?? (kj === null ? null : Math.round(kj / 4.184 * 100) / 100), protein: read("proteins_100g"), carbs: read("carbohydrates_100g"), fat: read("fat_100g"), fiber: read("fiber_100g") } });
  return result.success ? result.data : null;
}
const fields = "code,product_name,brands,serving_size,product_quantity_unit,nutrition_data_per,nutriments";
export class FoodProviderError extends Error {}
export async function lookupFoods(query: { term?: string; barcode?: string }, userAgent: string, fetcher: typeof fetch = fetch): Promise<FoodProduct[]> {
  const url = query.barcode ? new URL(`https://world.openfoodfacts.org/api/v3/product/${query.barcode}.json`) : new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("fields", fields);
  if (!query.barcode) {
    url.searchParams.set("search_terms", query.term!); url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process"); url.searchParams.set("json", "1"); url.searchParams.set("page_size", "20");
  }
  const response = await fetcher(url, { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (response.status === 404) return [];
  if (!response.ok) throw new FoodProviderError(response.status === 429 ? "Food search is busy. Please try again in a minute." : "The food database is temporarily unavailable. You can still log food manually.");
  const body = z.object({ product: z.unknown().optional(), products: z.array(z.unknown()).optional() }).parse(await response.json());
  return (query.barcode ? body.product ? [body.product] : [] : body.products ?? []).map(normalizeFood).filter((product): product is FoodProduct => product !== null);
}
