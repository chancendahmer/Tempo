import { describe, expect, it, vi } from "vitest";
import { foodProviderUserAgent, lookupFoods, normalizeFood } from "./open-food-facts";
import { scaleFood } from "../../domain/food";
import { localDay } from "../../domain/life-items";
describe("Open Food Facts boundary", () => {
  it.each(["http://localhost:3101", "http://127.0.0.1:3101", "http://127.0.1.2:3101", "http://[::1]:3101", "http://tempo.localhost:3101", "http://0.0.0.0:3101"])("uses a stable public project contact for local base %s", base => {
    expect(foodProviderUserAgent(base)).toBe("Tempo/1.0 (https://github.com/chancendahmer/Tempo)");
  });
  it("preserves production identity and sends the local contact through the actual request boundary", async () => {
    const production = "https://tempo-production-8e25.up.railway.app";
    expect(foodProviderUserAgent(production)).toBe(`Tempo/1.0 (${production})`);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hits: [] })));
    await lookupFoods({ term: "oats" }, foodProviderUserAgent("http://localhost:3101"), fetcher);
    expect(fetcher.mock.calls[0][1].headers["User-Agent"]).toBe("Tempo/1.0 (https://github.com/chancendahmer/Tempo)");
    fetcher.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    await expect(lookupFoods({ term: "oats" }, foodProviderUserAgent(production), fetcher)).rejects.toThrow("temporarily unavailable");
  });
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
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hits: [{ code: "12345678", product_name: "Rice", brands: ["Example brand", "  Second brand "] }] })));
    const result = await lookupFoods({ term: "brown rice" }, "Tempo/1.0 (https://example.com)", fetcher);
    expect(result[0].title).toBe("Rice");
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.href).toBe("https://search.openfoodfacts.org/search");
    expect(fetcher.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ q: "brown rice", page_size: 20, langs: ["en"] });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).fields).toContain("nutriments");
    expect(result[0]).toMatchObject({ brand: "Example brand, Second brand", basis: "unknown", serving: "", per100: { calories: null, fat: null } });
    expect(fetcher.mock.calls[0][1].headers["User-Agent"]).toContain("Tempo");
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(new Response("", { status: 404 }));
    expect(await lookupFoods({ barcode: "12345678" }, "Tempo/1.0", fetcher)).toEqual([]);
    expect((fetcher.mock.calls[1][0] as URL).pathname).toBe("/api/v3/product/12345678.json");
    expect(fetcher.mock.calls[1][1].method).toBeUndefined();
  });
  it("accepts the observed hosted-search shape without inventing serving units or missing nutrients", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hits: [{ code: "0736211663245", product_name: "Plain Yogurt", brands: ["Beijing Yogurt"], nutriments: { "energy-kcal_100g": 68, proteins_100g: 3.41, carbohydrates_100g: 14.77, fat_100g: 2.84, fiber_100g: 0 } }] })));
    const [product] = await lookupFoods({ term: "plain yogurt" }, "Tempo/1.0", fetcher);
    expect(product).toMatchObject({ barcode: "0736211663245", basis: "unknown", serving: "", per100: { calories: 68, protein: 3.41, fiber: 0 } });
    expect(scaleFood(product, 150).calories).toBe(102);
  });
  it("does not disguise search failures or malformed envelopes as no matches", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("Unavailable", { status: 404 }));
    await expect(lookupFoods({ term: "rice" }, "Tempo/1.0", fetcher)).rejects.toThrow("temporarily unavailable");
    fetcher.mockResolvedValue(new Response(JSON.stringify({ errors: [{ title: "Search unavailable" }] })));
    await expect(lookupFoods({ term: "rice" }, "Tempo/1.0", fetcher)).rejects.toThrow("unexpected response");
    fetcher.mockResolvedValue(new Response(JSON.stringify({ hits: [] })));
    expect(await lookupFoods({ term: "rice" }, "Tempo/1.0", fetcher)).toEqual([]);
  });
  it("uses the account timezone at midnight and DST boundaries", () => {
    expect(localDay(new Date("2026-09-28T02:00:00Z"), "America/New_York")).toBe("2026-09-27");
    expect(localDay(new Date("2026-03-08T07:00:00Z"), "America/New_York")).toBe("2026-03-08");
  });
});
