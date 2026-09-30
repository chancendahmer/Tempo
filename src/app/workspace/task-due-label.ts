export function taskDueLabel(value: string, timezone: string, includeDate = false) {
  const date = new Date(value);
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  const label = clock === "23:59" ? "By end of day" : new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(date);
  return includeDate ? `${new Intl.DateTimeFormat(undefined, { timeZone: timezone, month: "short", day: "numeric" }).format(date)} · ${label}` : label;
}
