import { and, eq, sql } from "drizzle-orm";
import type { AssistantCommand } from "../../domain/assistant-commands";
import { getDatabase, TempoDatabase } from "../client";
import { lifeItems } from "../schema";
import { mutateWorkspace, WorkspaceConflict } from "./workspace-repository";
import { foodCatalog } from "./food-catalog";
import { isSensitiveMemory } from "../../domain/memory-service";

export class LifeAssistant {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}
  async execute(userId: string, sourceMessageId: string, command: Extract<AssistantCommand, { type: "food_search" | "life_list" | "life_save" | "life_remove" }>) {
    if (command.type === "food_search") return JSON.stringify(await foodCatalog(userId, command, this.database));
    if (command.type === "life_list") {
      const rows = await this.database.select({ id: lifeItems.id, version: lifeItems.version, data: lifeItems.data }).from(lifeItems).where(and(eq(lifeItems.userId, userId), sql`${lifeItems.data}->>'kind' = ${command.kind}`)).limit(100);
      return JSON.stringify(rows);
    }
    try {
      if (command.type === "life_remove") return (await mutateWorkspace(userId, { action: "delete", id: command.id, version: command.version }, this.database, sourceMessageId)).message;
      if (command.data.kind === "focus") return "Start or pause a focus session using the workspace controls, or start its task.";
      if (isSensitiveMemory(JSON.stringify(command.data))) return "I can save everyday plans and preferences, but not secrets or sensitive medical details.";
      if (Boolean(command.id) !== Boolean(command.version)) return "Read the current item before editing; both its id and version are required.";
      return (await mutateWorkspace(userId, { action: "save", id: command.id ?? sourceMessageId, version: command.version ?? 0, data: command.data }, this.database, sourceMessageId)).message;
    } catch (error) {
      if (error instanceof WorkspaceConflict) return error.message;
      throw error;
    }
  }
}
