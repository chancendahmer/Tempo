export const HEALTH_CAPABILITY_LIMIT = "Google Health / Google Fit is not supported. Tempo cannot read or sync your steps. Movement has no step-count field; you can save a step count as a note in Thought inbox if you ask.";

/** Render provider status without claiming unsupported integrations or fields. */
export function connectionStatusReply(status: string): string {
  let details: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(status);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) details = parsed as Record<string, unknown>;
  } catch { /* Plain-text availability failures are preserved below. */ }
  const lines: string[] = [];
  const labels = {
    calendar: "Google Calendar", webSearch: "Web search", proactiveCoaching: "Proactive check-ins", cleanupCheckins: "Cleanup check-ins",
    memory: "Memory", tasksAndReminders: "Tasks and reminders", workspace: "Workspace",
    wakeAndWindDown: "Wake & Wind Down", otherAccounts: "Other accounts",
  };
  for (const [key, label] of Object.entries(labels)) {
    if (typeof details[key] === "string") lines.push(`${label}: ${details[key]}.`);
  }
  if (!lines.length) lines.push(status);
  lines.push(HEALTH_CAPABILITY_LIMIT);
  lines.push("Manage supported connections in Extensions.");
  return lines.join("\n\n");
}
