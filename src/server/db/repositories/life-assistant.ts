import { and, eq, sql } from "drizzle-orm";
import type { AssistantCommand } from "../../domain/assistant-commands";
import { getDatabase, TempoDatabase } from "../client";
import { lifeItems } from "../schema";
import { mutateWorkspace, WorkspaceConflict } from "./workspace-repository";
import { foodCatalog } from "./food-catalog";
import { isSensitiveMemory } from "../../domain/memory-service";

export class LifeAssistant {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}
  async execute(userId: string, sourceMessageId: string, command: Extract<AssistantCommand, { type: "food_search" | "life_list" | "life_save" | "life_remove" | "grocery_add" }>) {
    if (command.type === "food_search") return JSON.stringify(await foodCatalog(userId, command, this.database));
    if (command.type === "life_list") {
      const rows = await this.database.select({ id: lifeItems.id, version: lifeItems.version, data: lifeItems.data }).from(lifeItems).where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'kind' = ${command.kind}`)).limit(100);
      return JSON.stringify(rows);
    }
    try {
      if (command.type === "grocery_add") {
        if (isSensitiveMemory(JSON.stringify(command.items))) return "I can save everyday groceries, but not secrets or sensitive medical details.";
        return (await mutateWorkspace(userId, { action: "add_groceries", items: command.items }, this.database, sourceMessageId)).message;
      }
      if (command.type === "life_remove") return (await mutateWorkspace(userId, { action: "delete", id: command.id, version: command.version }, this.database, sourceMessageId)).message;
      if (command.data.kind === "focus") return "Start or pause a focus session using the workspace controls, or start its task.";
      if (isSensitiveMemory(JSON.stringify(command.data))) return "I can save everyday plans and preferences, but not secrets or sensitive medical details.";
      if (Boolean(command.id) !== Boolean(command.version)) return "Read the current item before editing; both its id and version are required.";
      if (command.sourceRecipeId) {
        if (command.data.kind !== "meal") return "A saved recipe can only supply ingredients for a meal plan.";
        const [source] = await this.database.select({ data: lifeItems.data }).from(lifeItems)
          .where(and(eq(lifeItems.userId, userId), eq(lifeItems.id, command.sourceRecipeId))).limit(1);
        if (!source || source.data.kind !== "recipe") return "I couldn’t find that saved recipe in your account. Read your recipes before planning it.";
        if (source.data.ingredients.length > 4000) return "That recipe’s ingredients are too long for a meal plan. Please shorten the saved ingredient list first.";
        command = { ...command, data: { ...command.data, ingredients: source.data.ingredients } };
      }
      const result = await mutateWorkspace(userId, { action: "save", id: command.id ?? sourceMessageId, version: command.version ?? 0, data: command.data }, this.database, sourceMessageId);
      if (result.message !== "Saved.") return result.message;
      const data = command.data;
      const details = data.kind === "recipe" ? `Serves ${data.servings}.`
        : data.kind === "routine" ? `${data.time}, ${data.steps.length} steps.`
        : data.kind === "food" ? `${data.meal}, ${data.date}; ${data.calories === null ? "calories unknown" : `${data.calories} calories`}, ${data.protein === null ? "protein unknown" : `${data.protein}g protein`}.`
        : data.kind === "meal" ? `${data.meal}, ${data.date}.${data.servings ? ` ${data.servings} ${data.servings === 1 ? "serving" : "servings"}.` : ""}`
        : data.kind === "workout" ? `${data.minutes} minutes, ${data.date}.` : "";
      return `${command.id ? "Updated" : "Saved"}: ${data.title}.${details ? ` ${details}` : ""}`;
    } catch (error) {
      if (error instanceof WorkspaceConflict) return error.message;
      throw error;
    }
  }
}
