export type CalendarConnectionStatus = "active" | "requires_reauth" | "disconnected";

export function calendarConnectionCopy(status: CalendarConnectionStatus) {
  if (status === "active") {
    return {
      badge: "Connected",
      badgeClass: "connected",
      action: "Reconnect Google Calendar",
      description: "Lets Tempo read your primary calendar and propose personal event additions, moves, and deletions. Every change needs your confirmation by text. Older connections may need to reconnect to grant event access.",
    };
  }
  if (status === "requires_reauth") {
    return {
      badge: "Reconnect required",
      badgeClass: "reauthorize",
      action: "Reconnect Google Calendar",
      description: "Google needs you to reconnect before Tempo can read your calendar again.",
    };
  }
  return {
    badge: "Not connected",
    badgeClass: "available",
    action: "Connect Google Calendar",
    description: "Lets Tempo read your primary calendar and propose personal event additions, moves, and deletions. Every change needs your confirmation by text.",
  };
}
