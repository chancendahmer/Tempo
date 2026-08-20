export const INITIAL_START_REPLY = "I will get started right now!";
export const INITIAL_SNOOZE_REPLY = "Give me 15";
export const FOLLOWUP_START_REPLY = "I told myself I would do it, starting now.";
export const FOLLOWUP_DECLINE_REPLY = "Not today sorry";

export type AccountabilityStage = "initial" | "followup";
export type AccountabilityChoice = "start" | "snooze" | "decline";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function classifyAccountabilityReply(body: string, stage: AccountabilityStage): AccountabilityChoice | null {
  const value = normalize(body);
  if (stage === "initial") {
    if (/^(i will )?(get )?start(ed|ing)?( right)? now$/.test(value) || value === "i will get started right now") return "start";
    if (/^(please )?give me (15|fifteen)( minutes?)?$/.test(value) || value === "15") return "snooze";
    if (/^not today( sorry)?$/.test(value) || value === "skip today") return "decline";
    return null;
  }
  if (value === "i told myself i would do it starting now" || /^(im |i am )?start(ing)? now$/.test(value)) return "start";
  if (/^not today( sorry)?$/.test(value) || value === "skip today") return "decline";
  return null;
}

export function buildInitialAccountabilityPrompt(nudge: string): string {
  const choices = `Reply “${INITIAL_START_REPLY}” or “${INITIAL_SNOOZE_REPLY}”.`;
  const normalized = nudge.replace(/\s+/g, " ").trim();
  if (normalized.includes(INITIAL_START_REPLY) && normalized.includes(INITIAL_SNOOZE_REPLY)) return normalized.slice(0, 320);
  const available = 320 - choices.length - 1;
  const shortened = normalized.length <= available ? normalized : `${normalized.slice(0, Math.max(0, available - 1)).trimEnd()}…`;
  return `${shortened}\n${choices}`;
}

export function buildFollowupAccountabilityPrompt(): string {
  return `Your 15 minutes are up. Reply “${FOLLOWUP_START_REPLY}” or “${FOLLOWUP_DECLINE_REPLY}”.`;
}
