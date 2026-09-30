import { z } from "zod";
import type { MessagingService } from "./sms-transport";

// Sendblue documents lowercase "sms" on fallback responses. Service is optional
// metadata: an unfamiliar value must not discard an accepted message's handle.
export const sendblueServiceSchema = z.unknown().transform((value): MessagingService | undefined => {
  if (typeof value !== "string") return undefined;
  switch (value.trim().toLowerCase()) {
    case "imessage": return "iMessage";
    case "sms": return "SMS";
    case "rcs": return "RCS";
    default: return undefined;
  }
}).optional();
