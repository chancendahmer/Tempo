import { and, desc, eq, gt, ilike, inArray, isNull, or } from "drizzle-orm";
import { MemoryRepository } from "../../domain/memory-service";
import { getDatabase, TempoDatabase } from "../client";
import { memoryEntries } from "../schema";

export class DrizzleMemoryRepository implements MemoryRepository {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async retrieveRelevant(userId: string, now: Date, limit: number) {
    const rows = await this.database.select({
      id: memoryEntries.id,
      content: memoryEntries.content,
      category: memoryEntries.category,
      confidence: memoryEntries.confidence,
    }).from(memoryEntries).where(and(
      eq(memoryEntries.userId, userId),
      eq(memoryEntries.sensitivity, "normal"),
      isNull(memoryEntries.deletedAt),
      or(isNull(memoryEntries.expiresAt), gt(memoryEntries.expiresAt, now)),
    )).orderBy(desc(memoryEntries.confidence), desc(memoryEntries.lastConfirmedAt), desc(memoryEntries.createdAt)).limit(limit);
    if (rows.length > 0) {
      await this.database.update(memoryEntries).set({ lastReferencedAt: now, updatedAt: now })
        .where(inArray(memoryEntries.id, rows.map((row) => row.id)));
    }
    return rows;
  }

  async forgetMatching(userId: string, query: string, now: Date) {
    const normalized = query.trim().replace(/[.!]+$/, "").toLowerCase();
    if (!normalized) return 0;
    return this.database.transaction(async (transaction) => {
      const matches = await transaction.select().from(memoryEntries).where(and(
        eq(memoryEntries.userId, userId), isNull(memoryEntries.deletedAt),
        ilike(memoryEntries.content, `%${normalized.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`),
      )).for("update");
      for (const memory of matches) {
        // A food list can contain multiple independent preferences. Forget only
        // the matching item, preserving the rest of that user-approved list.
        const foods = /^favorite food:\s*/i.test(memory.content)
          ? memory.content.replace(/^favorite food:\s*/i, "").replace(/\.$/, "").split(/\s+and\s+|,\s*/i)
          : [];
        const remaining = foods.filter((food) => !food.toLowerCase().includes(normalized));
        const content = remaining.length && remaining.length < foods.length
          ? `Favorite food: ${remaining.join(" and ")}.` : null;
        await transaction.update(memoryEntries).set(content
          ? { content, updatedAt: now }
          : { deletedAt: now, updatedAt: now })
          .where(and(eq(memoryEntries.id, memory.id), eq(memoryEntries.userId, userId)));
      }
      return matches.length;
    });
  }

  async forgetMostRecent(userId: string, now: Date) {
    const [recent] = await this.database.select({ id: memoryEntries.id }).from(memoryEntries).where(and(
      eq(memoryEntries.userId, userId), isNull(memoryEntries.deletedAt),
    )).orderBy(desc(memoryEntries.lastReferencedAt), desc(memoryEntries.createdAt)).limit(1);
    if (!recent) return false;
    await this.database.update(memoryEntries).set({ deletedAt: now, updatedAt: now }).where(eq(memoryEntries.id, recent.id));
    return true;
  }

  async supersedePreference(input: Parameters<MemoryRepository["supersedePreference"]>[0]) {
    await this.database.transaction(async (transaction) => {
      const [alreadyStored] = await transaction.select({ id: memoryEntries.id }).from(memoryEntries).where(and(
        eq(memoryEntries.userId, input.userId),
        eq(memoryEntries.sourceMessageId, input.sourceMessageId),
        eq(memoryEntries.category, "preference"),
      )).limit(1);
      if (alreadyStored) return;
      const [prior] = await transaction.select({ id: memoryEntries.id }).from(memoryEntries).where(and(
        eq(memoryEntries.userId, input.userId),
        eq(memoryEntries.category, "preference"),
        isNull(memoryEntries.deletedAt),
      )).orderBy(desc(memoryEntries.createdAt)).limit(1);
      const [created] = await transaction.insert(memoryEntries).values({
        userId: input.userId,
        category: "preference",
        content: input.content,
        confidence: 1,
        sourceMessageId: input.sourceMessageId,
        lastConfirmedAt: input.now,
      }).returning({ id: memoryEntries.id });
      if (prior) {
        await transaction.update(memoryEntries).set({
          supersededById: created.id,
          deletedAt: input.now,
          updatedAt: input.now,
        }).where(eq(memoryEntries.id, prior.id));
      }
    });
  }

  async storeExplicit(input: Parameters<MemoryRepository["storeExplicit"]>[0]) {
    await this.database.transaction(async (transaction) => {
      const [alreadyStored] = await transaction.select({ id: memoryEntries.id }).from(memoryEntries).where(and(
        eq(memoryEntries.userId, input.userId),
        eq(memoryEntries.sourceMessageId, input.sourceMessageId),
        eq(memoryEntries.category, input.category),
      )).limit(1);
      if (alreadyStored) return;
      await transaction.insert(memoryEntries).values({
        userId: input.userId,
        category: input.category,
        content: input.content,
        confidence: 1,
        sourceMessageId: input.sourceMessageId,
        lastConfirmedAt: input.now,
      });
    });
  }
}
