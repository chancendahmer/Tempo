import { and, desc, eq, or, sql } from "drizzle-orm";
import type { AssistantCommand } from "../../domain/assistant-commands";
import { getDatabase, TempoDatabase } from "../client";
import { lifeItems } from "../schema";
import { mutateWorkspace, WorkspaceConflict } from "./workspace-repository";
import { foodCatalog } from "./food-catalog";
import { isSensitiveMemory } from "../../domain/memory-service";
import { lifeSavedReply } from "../../domain/life-patch";
import { captureWithReminder } from "./capture-reminder";
import { refreshMealGroceries } from "./meal-groceries";
import { selectedDayLimit } from "./workspace-life-items";
import { nutritionTotals } from "../../domain/nutrition-totals";
import { readWorkspaceRundown } from "./workspace-rundown";

export class LifeAssistant {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}
  listForRundown(userId: string, startDate: string, endDateExclusive: string) {
    return readWorkspaceRundown(this.database, userId, startDate, endDateExclusive);
  }
  captureWithReminder(userId: string, sourceMessageId: string, command: Extract<AssistantCommand, {type: "capture_with_reminder"}>, now: Date, timezone: string) {
    return captureWithReminder(this.database, userId, sourceMessageId, command, now, timezone);
  }
  async execute(userId: string, sourceMessageId: string, command: Extract<AssistantCommand, { type: "food_search" | "life_list" | "life_save" | "life_patch" | "life_remove" | "grocery_add" }>, now = new Date()) {
    if (command.type === "food_search") return JSON.stringify(await foodCatalog(userId, command, this.database));
    if (command.type === "life_list") {
      if (command.kind === "grocery") await refreshMealGroceries(this.database, userId);
      const terms = [...new Set(command.query?.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
      const coverage = { kind: command.kind, id: command.id ?? null, query: command.query ?? null, date: command.date ?? null };
      if (command.query && (!terms.length || terms.length > 12)) return JSON.stringify({ items: [], truncated: false, coverage: { ...coverage, searched: false }, notice: "Use 1–12 search words for this lookup." });
      const summaryDate = command.kind === "food" && !command.id && !command.query ? command.date : undefined;
      const scope = and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'kind' = ${command.kind}`,
        command.date ? sql`${lifeItems.data}->>'date' = ${command.date}` : undefined);
      const itemLimit = 20;
      let rows = await this.database.select({ id: lifeItems.id, version: lifeItems.version, data: lifeItems.data }).from(lifeItems)
        .where(and(scope,
          command.id ? eq(lifeItems.id, command.id) : undefined,
          ...terms.map(term => sql`lower(concat_ws(' ', ${lifeItems.data}->>'title', ${lifeItems.data}->>'body', ${lifeItems.data}->>'ingredients', ${lifeItems.data}->>'instructions', ${lifeItems.data}->>'date', ${lifeItems.data}->>'meal', ${lifeItems.data}->>'activity', ${lifeItems.data}->>'period', ${lifeItems.data}->>'time', ${lifeItems.data}->>'steps', ${lifeItems.data}->>'barcode')) like ${`%${term}%`}`)))
        .orderBy(desc(lifeItems.createdAt), desc(lifeItems.id)).limit((summaryDate ? selectedDayLimit : itemLimit) + 1);
      let partial = false;
      // Natural-language qualifiers (such as month names) need not match the
      // stored representation. Offer bounded title candidates, never an assumed
      // match, when the strict lookup misses. IDs and owner/kind stay mandatory.
      const titleTerms = terms.filter(term => /[\p{L}]/u.test(term));
      if (!rows.length && !command.id && titleTerms.length) {
        const matches = titleTerms.map(term => sql`lower(${lifeItems.data}->>'title') like ${`%${term}%`}`);
        const rank = sql`(${sql.join(matches.map(match => sql`case when ${match} then 1 else 0 end`), sql` + ` )})`;
        rows = await this.database.select({id:lifeItems.id,version:lifeItems.version,data:lifeItems.data}).from(lifeItems)
          .where(and(scope, or(...matches)))
          .orderBy(desc(rank),desc(lifeItems.createdAt),desc(lifeItems.id)).limit(itemLimit + 1);
        partial = rows.length > 0;
      }
      const truncated = rows.length > itemLimit;
      const dateScope = command.date ? ` on ${command.date}` : "";
      let dailyNutrition;
      if (summaryDate) {
        const foods = rows.slice(0, selectedDayLimit).flatMap(row => row.data.kind === "food" ? [{ data: row.data }] : []);
        const incomplete = rows.length > selectedDayLimit;
        dailyNutrition = { date: summaryDate, totals: nutritionTotals(foods), included: foods.length, limit: selectedDayLimit, truncated: incomplete,
          notice: incomplete ? "Some food logs were omitted. These totals cover only the included logs." : "Totals cover all saved food logs on this date. Missing nutrients are unknown." };
      }
      return JSON.stringify({ items: rows.slice(0, itemLimit), truncated,
        coverage: { ...coverage, match: partial ? "partial title candidates" : "all search words", searched: true, limit: itemLimit },
        ...(dailyNutrition ? { dailyNutrition } : {}),
        notice: partial ? "No record matched every search word. These are partial title candidates only. Verify their date, meal and other requested details before selecting; ask which one if ambiguous." + (truncated ? " More candidates exist; narrow the query. This list is incomplete." : "")
          : truncated ? "More matching records exist; narrow the query or use an exact id. This item list is incomplete."
          : command.query || command.id ? `Only matching records of this kind${dateScope} are included; this is not a complete account search.` : `All records of this kind${dateScope} are included.` });
    }
    try {
      if (command.type === "grocery_add") {
        if (isSensitiveMemory(JSON.stringify(command.items))) return "I can save everyday groceries, but not secrets or sensitive medical details.";
        return (await mutateWorkspace(userId, { action: "add_groceries", items: command.items }, this.database, sourceMessageId, now)).message;
      }
      if (command.type === "life_remove") return (await mutateWorkspace(userId, { action: "delete", id: command.id, version: command.version }, this.database, sourceMessageId, now)).message;
      if (command.type === "life_patch") {
        if (isSensitiveMemory(JSON.stringify(command.patch))) return "I can save everyday plans and preferences, but not secrets or sensitive medical details.";
        return (await mutateWorkspace(userId, { action: "patch", id: command.id, version: command.version, patch: command.patch }, this.database, sourceMessageId, now)).message;
      }
      // Protect direct callers as well as the model schema: creation cannot be
      // used to replace an existing item or to bypass the patch contract.
      if ("id" in command || "version" in command) return "Existing items require life_patch with their current id and version; no change was made.";
      if (command.data.kind === "focus") return "Start or pause a focus session using the workspace controls, or start its task.";
      if (isSensitiveMemory(JSON.stringify(command.data))) return "I can save everyday plans and preferences, but not secrets or sensitive medical details.";
      const result = await mutateWorkspace(userId, { action: "save", id: sourceMessageId, version: 0, data: command.data, sourceRecipeId: command.sourceRecipeId }, this.database, sourceMessageId, now);
      if (result.message !== "Saved.") return result.message;
      return lifeSavedReply(command.data);
    } catch (error) {
      if (error instanceof WorkspaceConflict) return error.message;
      throw error;
    }
  }
}
