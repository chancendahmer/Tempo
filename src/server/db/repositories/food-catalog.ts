import { createHash } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, TempoDatabase } from "../client";
import { foodLookupCache } from "../schema";
import { OperationalRepository } from "./operational-repository";
import { lookupFoods, FoodProviderError } from "../../adapters/food/open-food-facts";
import { getServerEnv } from "../../config/env";
import { foodProductSchema } from "../../domain/food";

export const foodQuerySchema = z.object({ term: z.string().trim().min(2).max(100).optional(), barcode: z.string().regex(/^\d{8,14}$/).optional() }).refine(q => Boolean(q.term) !== Boolean(q.barcode), "Search by name or barcode.");
export async function foodCatalog(userId: string, raw: unknown, database: TempoDatabase = getDatabase()) {
  const query = foodQuerySchema.parse(raw);
  const key = createHash("sha256").update(query.barcode ? `barcode:${query.barcode}` : `search:${query.term!.toLowerCase()}`).digest("hex");
  const [cached] = await database.select().from(foodLookupCache).where(and(eq(foodLookupCache.key, key), gt(foodLookupCache.expiresAt, new Date()))).limit(1);
  if (cached) return z.array(foodProductSchema).parse(cached.products);
  const limits = new OperationalRepository(database);
  const personal = await limits.consumeRateLimit({ key: `food-user:${userId}`, limit: 12, windowMs: 60000 });
  if (!personal.allowed) throw new FoodProviderError("Please wait a minute before another food search.");
  // Shared PostgreSQL budget protects provider limits across web replicas and users.
  const provider = await limits.consumeRateLimit({ key: query.barcode ? "off-global-barcode" : "off-global-search", limit: query.barcode ? 12 : 8, windowMs: 60000 });
  if (!provider.allowed) throw new FoodProviderError("The food database is busy. Try again in a minute, or use a recent food.");
  const products = await lookupFoods(query, `Tempo/1.0 (${getServerEnv().APP_BASE_URL})`);
  await database.delete(foodLookupCache).where(lt(foodLookupCache.expiresAt, new Date()));
  await database.insert(foodLookupCache).values({ key, products, expiresAt: new Date(Date.now() + (products.length ? 86400000 : 300000)) }).onConflictDoUpdate({ target: foodLookupCache.key, set: { products, expiresAt: new Date(Date.now() + 86400000) } });
  return products;
}
