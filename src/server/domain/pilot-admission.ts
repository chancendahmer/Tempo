import { normalizeE164 } from "./phone";

export type PilotAdmissionPolicy = {
  PILOT_ADMISSION_MODE: "open" | "invite_only" | null;
  PILOT_INVITED_PHONES: readonly string[] | null;
};

// Invalid admission configuration closes new enrollment without preventing
// existing accounts from sending compliance commands. Never include input in errors.
export function parsePilotInvitedPhones(value: string): string[] | null {
  if (!value.trim()) return [];
  const entries = value.split(",").map(entry => entry.trim());
  if (entries.length > 100) return null;
  try {
    if (entries.some(entry => !/^\+[\d ()-]+$/.test(entry))) return null;
    return [...new Set(entries.map(entry => normalizeE164(entry)))];
  } catch {
    return null;
  }
}

export function isVerifiedExistingPilotAccount(account: {
  phoneVerifiedAt: Date | null;
  onboardingState: string;
} | undefined): boolean {
  return Boolean(account?.phoneVerifiedAt && account.onboardingState !== "awaiting_consent");
}

export function pilotAdmissionAllowed(policy: PilotAdmissionPolicy, phoneE164: string, verifiedExisting = false): boolean {
  return verifiedExisting || policy.PILOT_ADMISSION_MODE === "open"
    || (policy.PILOT_ADMISSION_MODE === "invite_only" && policy.PILOT_INVITED_PHONES?.includes(phoneE164) === true);
}
