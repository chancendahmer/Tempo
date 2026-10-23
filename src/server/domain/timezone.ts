import { z } from "zod";

export const ianaTimezoneSchema = z.string().trim().min(1).max(100).transform((value, context) => {
  // Named IANA zones and UTC are deliberate choices; numeric offsets and
  // ambiguous abbreviations are not suitable account time zones.
  try {
    if (value !== "UTC" && !value.includes("/")) throw new Error();
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    context.addIssue({ code: "custom", message: "Choose a valid IANA time zone, such as America/New_York or UTC." });
    return z.NEVER;
  }
});
