import { and, asc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { lifeItemSchema } from "../../domain/life-items";
import type { WorkspaceRundown } from "../../domain/rundown";
import type { TempoDatabase } from "../client";
import { lifeItems } from "../schema";

/** Read the same structured records used by the dashboard. Each kind has a
 * separate bounded budget so a full meal history cannot hide a routine. */
export async function readWorkspaceRundown(database: TempoDatabase, userId: string, startDate: string, endDateExclusive: string): Promise<WorkspaceRundown> {
  z.iso.date().parse(startDate);
  z.iso.date().parse(endDateExclusive);
  const span = (Date.parse(endDateExclusive) - Date.parse(startDate)) / 86400000;
  if (span < 1 || span > 7) throw new Error("Workspace rundown requires one to seven days");
  const kind = sql<string>`${lifeItems.data}->>'kind'`;
  const date = sql<string>`${lifeItems.data}->>'date'`;
  const ranked = database.select({
    id: lifeItems.id, data: lifeItems.data,
    rank: sql<number>`row_number() over (partition by ${kind} order by coalesce(${date}, ${lifeItems.data}->>'time') asc, ${lifeItems.id} asc)`.mapWith(Number).as("rundown_rank"),
    total: sql<number>`count(*) over (partition by ${kind})`.mapWith(Number).as("rundown_total"),
  }).from(lifeItems).where(and(eq(lifeItems.userId, userId), sql`(${kind} = 'routine' or (${kind} in ('meal', 'workout') and ${date} >= ${startDate} and ${date} < ${endDateExclusive}))`)).as("rundown_items");
  const rows = await database.select().from(ranked).where(lte(ranked.rank, 100)).orderBy(asc(ranked.rank), asc(ranked.id));
  const items: WorkspaceRundown["items"] = [];
  for (const row of rows) {
    const data = lifeItemSchema.parse(row.data);
    if (data.kind === "routine" || data.kind === "meal" || data.kind === "workout") items.push({ id: row.id, data });
  }
  return { items, truncated: rows.some(row => row.total > 100) };
}
