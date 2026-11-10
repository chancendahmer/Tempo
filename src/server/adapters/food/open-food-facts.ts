import { z } from "zod";
import { foodProductSchema, FoodProduct } from "../../domain/food";

const rawProduct = z.object({ code: z.union([z.string(), z.number()]).optional(), product_name: z.string().optional(), brands: z.union([z.string(), z.array(z.string()).max(100)]).optional(), serving_size: z.string().optional(), product_quantity_unit: z.string().optional(), nutrition_data_per: z.string().optional(), nutriments: z.record(z.string(), z.unknown()).optional() }).passthrough();
export function normalizeFood(raw: unknown): FoodProduct | null {
  const parsed = rawProduct.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data, n = p.nutriments ?? {};
  const read = (key: string) => typeof n[key] === "number" && Number.isFinite(n[key]) && n[key] >= 0 ? n[key] as number : null;
  const kcal = read("energy-kcal_100g"), kj = read("energy-kj_100g") ?? read("energy_100g");
  const unit = p.product_quantity_unit?.toLowerCase();
  const brand = Array.isArray(p.brands) ? p.brands.map(value => value.trim()).filter(Boolean).join(", ") : p.brands ?? "";
  const result = foodProductSchema.safeParse({ barcode: String(p.code ?? ""), title: (p.product_name || "Unnamed product").slice(0, 240), brand: brand.slice(0, 300), serving: (p.serving_size ?? "").slice(0, 100), basis: unit === "ml" || unit === "l" ? "ml" : unit === "g" || unit === "kg" ? "g" : "unknown", per100: { calories: kcal ?? (kj === null ? null : Math.round(kj / 4.184 * 100) / 100), protein: read("proteins_100g"), carbs: read("carbohydrates_100g"), fat: read("fat_100g"), fiber: read("fiber_100g") } });
  return result.success ? result.data : null;
}
const fields = "code,product_name,brands,serving_size,product_quantity_unit,nutrition_data_per,nutriments";
export function foodProviderUserAgent(appBaseUrl: string): string {
  const hostname = new URL(appBaseUrl).hostname.toLowerCase();
  const local = hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "[::1]" || hostname === "0.0.0.0" || /^127\./.test(hostname);
  // Identify local runs with the public project rather than an unreachable
  // loopback contact. Public deployments retain their configured identity.
  return `Tempo/1.0 (${local ? "https://github.com/chancendahmer/Tempo" : appBaseUrl})`;
}
export class FoodProviderError extends Error {}
export async function lookupFoods(query: { term?: string; barcode?: string }, userAgent: string, fetcher: typeof fetch = fetch): Promise<FoodProduct[]> {
  const url = query.barcode ? new URL(`https://world.openfoodfacts.org/api/v3/product/${query.barcode}.json`) : new URL("https://search.openfoodfacts.org/search");
  if (query.barcode) url.searchParams.set("fields", fields);
  // Hosted Search-a-licious is the documented full-text API. Keep the search
  // term in its POST body; do not fan out into per-product barcode requests.
  const response = await fetcher(url, { ...(query.barcode ? {} : { method: "POST", body: JSON.stringify({ q: query.term, fields: fields.split(","), page_size: 20, page: 1, langs: ["en"] }) }), headers: { "User-Agent": userAgent, Accept: "application/json", ...(!query.barcode ? { "Content-Type": "application/json" } : {}) }, signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (response.status === 404 && query.barcode) return [];
  if (!response.ok) throw new FoodProviderError(response.status === 429 ? "Food search is busy. Please try again in a minute." : "The food database is temporarily unavailable. You can still log food manually.");
  const raw = await response.json();
  const body = query.barcode ? z.object({ product: z.unknown().optional() }).safeParse(raw) : z.object({ hits: z.array(z.unknown()).max(20) }).safeParse(raw);
  if (!body.success) throw new FoodProviderError("The food database returned an unexpected response. You can still log food manually.");
  const products = "hits" in body.data ? body.data.hits : body.data.product ? [body.data.product] : [];
  return products.map(normalizeFood).filter((product): product is FoodProduct => product !== null);
}
