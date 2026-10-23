import { eq } from "drizzle-orm";
import { getDatabase, type TempoDatabase } from "../client";
import { users } from "../schema";
import { gentleSetupActionSchema, readWorkspacePreferences, type GentleSetup, type GentleSetupAction, type WorkspacePreferences } from "../../domain/gentle-setup";

export class SetupAccountUnavailable extends Error {}

export async function readGentleSetup(userId: string, database: TempoDatabase = getDatabase()): Promise<GentleSetup> {
  const [account] = await database.select({ displayName: users.displayName, coachingTone: users.coachingTone, timezone: users.timezone, preferences: users.workspacePreferences }).from(users).where(eq(users.id, userId)).limit(1);
  if (!account) throw new SetupAccountUnavailable("Your account is unavailable.");
  return { ...readWorkspacePreferences(account.preferences), displayName: account.displayName, coachingTone: account.coachingTone, timezone: account.timezone };
}

export async function saveGentleSetup(userId: string, input: GentleSetupAction, database: TempoDatabase = getDatabase(), now = new Date()): Promise<GentleSetup> {
  const action = gentleSetupActionSchema.parse(input);
  return database.transaction(async transaction => {
    const [account] = await transaction.select({ preferences: users.workspacePreferences }).from(users).where(eq(users.id, userId)).for("update");
    if (!account) throw new SetupAccountUnavailable("Your account is unavailable.");
    const previous = readWorkspacePreferences(account.preferences);
    const setupStatus: WorkspacePreferences["setupStatus"] = action.action === "timezone" ? previous.setupStatus : action.action === "save" || previous.setupStatus === "complete" ? "complete" : "skipped";
    const preferences = { ...account.preferences, ...previous, setupStatus,
      ...(action.action === "save" && action.showStreak !== undefined ? { showStreak: action.showStreak } : {}),
      ...(action.action === "timezone" ? { timezoneConfirmedAt: now.toISOString() } : {}) };
    await transaction.update(users).set({
      workspacePreferences: preferences,
      ...(action.action === "timezone" ? { timezone: action.timezone } : {}),
      ...(action.action === "save" && action.displayName !== undefined ? { displayName: action.displayName || null } : {}),
      ...(action.action === "save" && action.coachingTone !== undefined ? { coachingTone: action.coachingTone } : {}),
      updatedAt: now,
    }).where(eq(users.id, userId));
    return readGentleSetup(userId, transaction as unknown as TempoDatabase);
  });
}
