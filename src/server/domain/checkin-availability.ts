export type CheckinAvailability = { state: "off" | "paused" | "setup" | "calendar" | "eligible"; title: string; detail: string };

/** Availability, not a promise of a message: delivery always rechecks its gates. */
export function checkinAvailability(input: {
  proactiveOptIn: boolean;
  accountActive: boolean;
  onboardingComplete: boolean;
  dailyInterventionCap: number;
  deliveryEnabled: boolean;
  cleanupEnabled?: boolean;
  calendar: { status: string; lastSyncedAt: Date | string | null } | null;
  now?: Date;
}): CheckinAvailability {
  if (!input.proactiveOptIn) return { state: "off", title: "Check-ins are off", detail: "Tempo will still reply when you ask. Reminders you explicitly schedule use a separate delivery path." };
  if (!input.deliveryEnabled && !input.cleanupEnabled) return { state: "paused", title: "Preference saved · pilot sending paused", detail: "You have opted in, but automatic check-ins are not enabled for this pilot account yet. Your requested reminders are separate." };
  if (!input.accountActive) return { state: "paused", title: "Check-ins are paused", detail: "Your account is paused or inactive. Resume your account before expecting optional texts." };
  if (input.dailyInterventionCap <= 0) return { state: "paused", title: "Your check-in limit is zero", detail: "If you want optional texts again, turn check-ins off and back on. This restores a limit of one per day without changing your quiet hours." };
  if (!input.onboardingComplete) return { state: "setup", title: "Finish text setup", detail: "Continue the setup questions in your Tempo text conversation so your time zone, quiet hours and coaching preferences are ready." };
  const now = input.now ?? new Date();
  const synced = input.calendar?.lastSyncedAt ? new Date(input.calendar.lastSyncedAt).getTime() : NaN;
  if (input.calendar?.status !== "active" || !Number.isFinite(synced) || synced > now.getTime() || now.getTime() - synced > 45 * 60_000) {
    return { state: "calendar", title: "Waiting for a current calendar connection", detail: "Connect or reconnect Google Calendar in Connections. Tempo waits for fresh availability before suggesting an open window." };
  }
  if (!input.deliveryEnabled) return { state: "eligible", title: "Old-item reviews are active", detail: "Tempo can ask whether an older saved item is still useful. Task coaching is not enabled for this pilot account yet. Quiet hours, focus time and delivery limits still apply. Items are not deleted just because they are old." };
  return { state: "eligible", title: "Timing checks are active", detail: "Tempo looks for a useful moment, not a fixed texting schedule. Quiet hours, focus time, recent activity, daily limits and AI budget can still mean no message. You can turn this off anytime." };
}
