import { and, desc, eq, or, sql } from "drizzle-orm";
import type { AssistantCommand } from "../../domain/assistant-commands";
import { getDatabase, TempoDatabase } from "../client";
import { lifeItems } from "../schema";
import { mutateWorkspace, WorkspaceConflict } from "./workspace-repository";
import { foodCatalog } from "./food-catalog";
import { isSensitiveMemory } from "../../domain/memory-service";
import { lifeSavedReply } from "../../domain/life-patch";
import { captureWithReminder } from "./capture-reminder";

export class LifeAssistant {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}
  captureWithReminder(userId: string, sourceMessageId: string, command: Extract<AssistantCommand, {type: "capture_with_reminder"}>, now: Date, timezone: string) {
    return captureWithReminder(this.database, userId, sourceMessageId, command, now, timezone);
  }
  async execute(userId: string, sourceMessageId: string, command: Extract<AssistantCommand, { type: "food_search" | "life_list" | "life_save" | "life_patch" | "life_remove" | "grocery_add" }>) {
    if (command.type === "food_search") return JSON.stringify(await foodCatalog(userId, command, this.database));
    if (command.type === "life_list") {
      const terms = [...new Set(command.query?.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
      if (command.query && (!terms.length || terms.length > 12)) return JSON.stringify({ items: [], truncated: false, coverage: { kind: command.kind, query: command.query, searched: false }, notice: "Use 1–12 search words for this lookup." });
      let rows = await this.database.select({ id: lifeItems.id, version: lifeItems.version, data: lifeItems.data }).from(lifeItems)
        .where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'kind' = ${command.kind}`,
          command.id ? eq(lifeItems.id, command.id) : undefined,
          ...terms.map(term => sql`lower(concat_ws(' ', ${lifeItems.data}->>'title', ${lifeItems.data}->>'body', ${lifeItems.data}->>'ingredients', ${lifeItems.data}->>'instructions', ${lifeItems.data}->>'date', ${lifeItems.data}->>'meal', ${lifeItems.data}->>'activity', ${lifeItems.data}->>'period', ${lifeItems.data}->>'time', ${lifeItems.data}->>'steps', ${lifeItems.data}->>'barcode')) like ${`%${term}%`}`)))
        .orderBy(desc(lifeItems.createdAt), desc(lifeItems.id)).limit(21);
      let partial = false;
      // Natural-language qualifiers (such as month names) need not match the
      // stored representation. Offer bounded title candidates, never an assumed
      // match, when the strict lookup misses. IDs and owner/kind stay mandatory.
      const titleTerms = terms.filter(term => /[\p{L}]/u.test(term));
      if (!rows.length && !command.id && titleTerms.length) {
        const matches = titleTerms.map(term => sql`lower(${lifeItems.data}->>'title') like ${`%${term}%`}`);
        const rank = sql`(${sql.join(matches.map(match => sql`case when ${match} then 1 else 0 end`), sql` + ` )})`;
        rows = await this.database.select({id:lifeItems.id,version:lifeItems.version,data:lifeItems.data}).from(lifeItems)
          .where(and(eq(lifeItems.userId,userId),sql`${lifeItems.data}->>'kind' = ${command.kind}`,or(...matches)))
          .orderBy(desc(rank),desc(lifeItems.createdAt),desc(lifeItems.id)).limit(21);
        partial = rows.length > 0;
      }
      return JSON.stringify({ items: rows.slice(0, 20), truncated: rows.length > 20,
        coverage: { kind: command.kind, id: command.id ?? null, query: command.query ?? null, match: partial ? "partial title candidates" : "all search words", searched: true, limit: 20 },
        notice: partial ? "No record matched every search word. These are partial title candidates only. Verify their date, meal and other requested details before selecting; ask which one if ambiguous." + (rows.length > 20 ? " More candidates exist; narrow the query. This list is incomplete." : "") : rows.length > 20 ? "More matching records exist; narrow the query or use an exact id. This list is incomplete."
          : command.query || command.id ? "Only matching records of this kind are included; this is not a complete account search." : "All records of this kind are included." });
    }
    try {
      if (command.type === "grocery_add") {
        if (isSensitiveMemory(JSON.stringify(command.items))) return "I can save everyday groceries, but not secrets or sensitive medical details.";
        return (await mutateWorkspace(userId, { action: "add_groceries", items: command.items }, this.database, sourceMessageId)).message;
      }
      if (command.type === "life_remove") return (await mutateWorkspace(userId, { action: "delete", id: command.id, version: command.version }, this.database, sourceMessageId)).message;
      if (command.type === "life_patch") {
        if (isSensitiveMemory(JSON.stringify(command.patch))) return "I can save everyday plans and preferences, but not secrets or sensitive medical details.";
        return (await mutateWorkspace(userId, { action: "patch", id: command.id, version: command.version, patch: command.patch }, this.database, sourceMessageId)).message;
      }
      // Protect direct callers as well as the model schema: creation cannot be
      // used to replace an existing item or to bypass the patch contract.
      if ("id" in command || "version" in command) return "Existing items require life_patch with their current id and version; no change was made.";
      if (command.data.kind === "focus") return "Start or pause a focus session using the workspace controls, or start its task.";
      if (isSensitiveMemory(JSON.stringify(command.data))) return "I can save everyday plans and preferences, but not secrets or sensitive medical details.";
      if (command.sourceRecipeId) {
        if (command.data.kind !== "meal") return "A saved recipe can only supply ingredients for a meal plan.";
        const [source] = await this.database.select({ data: lifeItems.data }).from(lifeItems)
          .where(and(eq(lifeItems.userId, userId), eq(lifeItems.id, command.sourceRecipeId))).limit(1);
        if (!source || source.data.kind !== "recipe") return "I couldn’t find that saved recipe in your account. Read your recipes before planning it.";
        if (source.data.ingredients.length > 4000) return "That recipe’s ingredients are too long for a meal plan. Please shorten the saved ingredient list first.";
        command = { ...command, data: { ...command.data, ingredients: source.data.ingredients } };
      }
      const result = await mutateWorkspace(userId, { action: "save", id: sourceMessageId, version: 0, data: command.data }, this.database, sourceMessageId);
      if (result.message !== "Saved.") return result.message;
      return lifeSavedReply(command.data);
    } catch (error) {
      if (error instanceof WorkspaceConflict) return error.message;
      throw error;
    }
  }
}
