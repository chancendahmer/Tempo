import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { TempoDatabase } from "../client";
import { lifeItems, users } from "../schema";
import { groceriesForMeals, ingredientKey } from "../../domain/meal-groceries";
import { lifeItemSchema, localDay } from "../../domain/life-items";

/** Runs inside mutateWorkspace's account lock and transaction. */
export async function reconcileMealGroceries(database: TempoDatabase, userId: string, fromDate: string) {
  const items = await database.select({ id: lifeItems.id, version: lifeItems.version, data: lifeItems.data }).from(lifeItems)
    .where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'kind' in ('meal','grocery','pantry')`));
  const desired = groceriesForMeals(items, fromDate);
  for (const item of items) {
    if (item.data.kind !== "grocery" || !item.data.mealSources) continue;
    const key = ingredientKey(item.data), next = desired.get(key);
    if (!next) await database.delete(lifeItems).where(and(eq(lifeItems.userId, userId), eq(lifeItems.id, item.id)));
    else {
      // Purchasing is not stocking. Preserve the user's checkbox even when
      // portions change; only an explicit pantry record affects quantities.
      const data = lifeItemSchema.parse({ ...next, checked: item.data.checked });
      if (!isDeepStrictEqual(item.data, data)) await database.update(lifeItems).set({ data, version: sql`${lifeItems.version} + 1`, updatedAt: new Date() }).where(and(eq(lifeItems.userId, userId), eq(lifeItems.id, item.id)));
      desired.delete(key);
    }
  }
  if (desired.size) await database.insert(lifeItems).values([...desired.values()].map(data => ({ id: randomUUID(), userId, data: lifeItemSchema.parse(data) })));
}

/** A timezone day change must expire old meal sources even without a new edit. */
export async function refreshMealGroceries(database: TempoDatabase, userId: string) {
  return database.transaction(async transaction => {
    const [user] = await transaction.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).for("update");
    if (!user) return;
    const today = localDay(new Date(), user.timezone);
    await reconcileMealGroceries(transaction as unknown as TempoDatabase, userId, today);
    return today;
  });
}
