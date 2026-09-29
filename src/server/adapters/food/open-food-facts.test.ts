import { describe, expect, it, vi } from "vitest";
import { lookupFoods, normalizeFood } from "./open-food-facts";
import { scaleFood } from "../../domain/food";
import { localDay } from "../../domain/life-items";
describe("Open Food Facts boundary", () => {
  it("keeps absent nutrients unknown and scales only known numbers", () => {
    const product = normalizeFood({ code: "12345678", product_name: "Yogurt", product_quantity_unit: "g", nutriments: { "energy-kcal_100g": 100, proteins_100g: 8, fat_100g: 0 } })!;
    expect(scaleFood(product, 150)).toEqual({ calories: 150, protein: 12, carbs: null, fat: 0, fiber: null });
    expect(product.basis).toBe("g");
    expect(() => scaleFood(product, -1)).toThrow();
  });
  it("converts kJ when kcal is absent, rejects malformed codes, and flags unknown units", () => {
    expect(normalizeFood({ code: "12345678", nutriments: { "energy-kj_100g": 418.4 } })).toMatchObject({ basis: "unknown", per100: { calories: 100 } });
    expect(normalizeFood({ code: "not-a-barcode" })).toBeNull();
    expect(normalizeFood({ code: "12345678", nutriments: { fat_100g: -1 } })?.per100.fat).toBeNull();
  });
  it("uses bounded explicit search requests and handles a missing barcode", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ products: [{ code: "12345678", product_name: "Rice" }] })));
    const result = await lookupFoods({ term: "brown rice" }, "Tempo/1.0 (https://example.com)", fetcher);
    expect(result[0].title).toBe("Rice");
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.hostname).toBe("world.openfoodfacts.org");
    expect(url.searchParams.get("search_terms")).toBe("brown rice");
    expect(fetcher.mock.calls[0][1].headers["User-Agent"]).toContain("Tempo");
    fetcher.mockResolvedValue(new Response("", { status: 404 }));
    expect(await lookupFoods({ barcode: "12345678" }, "Tempo/1.0", fetcher)).toEqual([]);
  });
  it("uses the account timezone at midnight and DST boundaries", () => {
    expect(localDay(new Date("2026-09-28T02:00:00Z"), "America/New_York")).toBe("2026-09-27");
    expect(localDay(new Date("2026-03-08T07:00:00Z"), "America/New_York")).toBe("2026-03-08");
  });
});
