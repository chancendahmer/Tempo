import { z } from "zod";

export const memoryCommandSchema = z.object({
  type: z.literal("remember_memory"),
  content: z.string().trim().min(1).max(500),
  category: z.enum(["preference", "fact", "pattern"]),
});

export type MemoryCommand = z.infer<typeof memoryCommandSchema>;

/** Refuse common secret and sensitive-data declarations before any persistence. */
export function isSensitiveMemory(content: string): boolean {
  return /\b(password|passcode|api[ _-]?key|secret|access token|refresh token|private key|social security|ssn|credit card|bank account|diagnosis|medical record)\b/i.test(content)
    || /\b(?:sk-[a-z0-9_-]{12,}|\d{3}-\d{2}-\d{4})\b/i.test(content);
}

const sensitiveMemoryReply = "I can remember everyday preferences, but I can’t save secrets or sensitive personal details.";

export type MemoryRecord = {
  id: string;
  content: string;
  category: "preference" | "pattern" | "fact" | "intervention_learning";
  confidence: number | null;
};

export interface MemoryRepository {
  retrieveRelevant(userId: string, now: Date, limit: number): Promise<MemoryRecord[]>;
  searchRelevant?(userId: string, now: Date, query: string | undefined, limit: number): Promise<MemoryRecord[]>;
  forgetMatching(userId: string, query: string, now: Date): Promise<number>;
  forgetMostRecent(userId: string, now: Date): Promise<boolean>;
  supersedePreference(input: { userId: string; content: string; sourceMessageId: string; now: Date }): Promise<void>;
  storeExplicit(input: {
    userId: string;
    content: string;
    category: "preference" | "fact" | "pattern";
    sourceMessageId: string;
    now: Date;
  }): Promise<void>;
}

export type MemoryCorrection =
  | { type: "forget"; query: string }
  | { type: "forget_recent" }
  | { type: "preference"; content: string }
  | { type: "remember"; content: string; category: "fact" | "pattern" }
  | { type: "start_favorite_food_log"; content: string }
  | { type: "favorite_food"; content: string };

export function parseMemoryCorrection(body: string): MemoryCorrection | null {
  const trimmed = body.trim();
  const forget = trimmed.match(/^forget(?: that| what you know about)?\s+(.+)$/i);
  if (forget) return { type: "forget", query: forget[1].replace(/[.!]+$/, "").trim() };
  if (/^(that'?s|that is) not true\.?$/i.test(trimmed)) return { type: "forget_recent" };
  const preference = trimmed.match(/^actually,?\s+i (?:prefer|work better with)\s+(.+)$/i);
  if (preference) return { type: "preference", content: `The user prefers ${preference[1].replace(/[.!]+$/, "")}.` };
  if (/\b(?:keep|start|make|create)(?:\s+me)?\s+(?:a\s+)?(?:running\s+)?(?:log|list|track)\s+of\s+my\s+favou?rite\s+foods?\b/i.test(trimmed)
    || /\bhelp me (?:remember|track) my favou?rite foods?\b/i.test(trimmed)) {
    return {
      type: "start_favorite_food_log",
      content: "The user wants Tempo to maintain a running favorite-food list and use it for meal suggestions.",
    };
  }
  const favoriteFood = trimmed.match(
    /^(?:add|save|log|remember)\s+(.+?)\s+(?:to|in|as)\s+(?:one of\s+)?my\s+favou?rite\s+foods?[.!]*$/i,
  ) ?? trimmed.match(/^my\s+favou?rite\s+foods?\s+(?:are|is|include)\s+(.+?)[.!]*$/i)
    ?? trimmed.match(/^(.+?)\s+(?:is|are)\s+(?:one of\s+)?my\s+favou?rite\s+foods?[.!]*$/i)
    ?? trimmed.match(/^i\s+(?:really\s+)?(?:like|love|enjoy)\s+(.+?)\s+(?:as|for)\s+(?:a\s+)?(?:dessert|breakfast|lunch|dinner|snack)[.!]*$/i);
  if (favoriteFood) {
    return {
      type: "favorite_food",
      content: `Favorite food: ${favoriteFood[1].replace(/[.!]+$/, "").trim()}.`,
    };
  }
  const remember = trimmed.match(/^remember(?: that)?\s+(.+)$/i);
  if (remember && !/^to\b/i.test(remember[1])) {
    const statement = remember[1].replace(/[.!]+$/, "").trim();
    const category = /\b(usually|always|often|tend to|works? best|struggle)\b/i.test(statement) ? "pattern" : "fact";
    return { type: "remember", category, content: `The user said: ${statement}.` };
  }
  return null;
}

export class MemoryService {
  constructor(private readonly repository: MemoryRepository) {}

  async retrieveRelevant(userId: string, now: Date, limit = 8) {
    return this.repository.retrieveRelevant(userId, now, Math.max(1, Math.min(limit, 20)));
  }

  async searchRelevant(userId: string, now: Date, query?: string, limit = 20) {
    const size = Math.max(1, Math.min(limit, 20));
    if (!this.repository.searchRelevant) {
      return { items: query ? [] : await this.retrieveRelevant(userId, now, size), truncated: true,
        coverage: "Topic search is unavailable; these results cannot establish that information was never saved." };
    }
    const terms = query?.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    if (query && (!terms.length || terms.length > 12)) return { items: [], truncated: false, coverage: "Use 1–12 distinctive search words." };
    const rows = await this.repository.searchRelevant(userId, now, query, size + 1);
    return { items: rows.slice(0, size), truncated: rows.length > size,
      coverage: rows.length > size ? "More matching saved facts exist; narrow the topic."
        : query ? "All active non-sensitive saved facts matching every search word; notes are searched separately."
        : "Active non-sensitive saved facts; notes are searched separately." };
  }

  async executeCommand(input: { userId: string; messageId: string; command: MemoryCommand; now: Date }) {
    if (isSensitiveMemory(input.command.content)) return sensitiveMemoryReply;
    await this.repository.storeExplicit({
      userId: input.userId,
      content: input.command.content,
      category: input.command.category,
      sourceMessageId: input.messageId,
      now: input.now,
    });
    return input.command.content.toLowerCase().startsWith("favorite food:")
      ? `Added to your favorite-food list: ${input.command.content.replace(/^Favorite food:\s*/i, "").replace(/\.$/, "")}.`
      : `Saved: ${input.command.content}`;
  }

  async tryHandleCorrection(input: { userId: string; messageId: string; body: string; now: Date },
    authorize?: (type: "remember_memory" | "forget_memory") => Promise<string | undefined>) {
    if (/^(?:(?:can|could|will|would) you )?remember my favou?rite foods?[?.!\s]*$/i.test(input.body.trim())) {
      return "Yes—I can keep your favorite foods and help you pick something when deciding feels hard. What’s one food you’d like me to remember?";
    }
    const correction = parseMemoryCorrection(input.body);
    if (!correction) return null;
    if ("content" in correction && isSensitiveMemory(correction.content)) return sensitiveMemoryReply;
    const denial = await authorize?.(correction.type === "forget" || correction.type === "forget_recent" ? "forget_memory" : "remember_memory");
    if (denial) return denial;
    if (correction.type === "forget") {
      const count = await this.repository.forgetMatching(input.userId, correction.query, input.now);
      return count > 0 ? "Forgot it." : "I couldn’t find a matching memory to remove.";
    }
    if (correction.type === "forget_recent") {
      return await this.repository.forgetMostRecent(input.userId, input.now)
        ? "Thanks for correcting me. I removed that memory."
        : "Thanks for the correction. I didn’t have a recent memory to remove.";
    }
    if (correction.type === "start_favorite_food_log") {
      await this.repository.storeExplicit({
        userId: input.userId,
        content: correction.content,
        category: "pattern",
        sourceMessageId: input.messageId,
        now: input.now,
      });
      return "Absolutely—I’ll keep a favorite-food list and use it when choosing feels hard. What should I add first? 🍽️";
    }
    if (correction.type === "favorite_food") {
      await this.repository.storeExplicit({
        userId: input.userId,
        content: correction.content,
        category: "preference",
        sourceMessageId: input.messageId,
        now: input.now,
      });
      return `Added to your favorite-food list: ${correction.content.replace(/^Favorite food:\s*/i, "").replace(/\.$/, "")}.`;
    }
    if (correction.type === "remember") {
      await this.repository.storeExplicit({
        userId: input.userId,
        content: correction.content,
        category: correction.category,
        sourceMessageId: input.messageId,
        now: input.now,
      });
      return "I’ll remember that. You can ask me to forget it anytime.";
    }
    await this.repository.supersedePreference({
      userId: input.userId,
      content: correction.content,
      sourceMessageId: input.messageId,
      now: input.now,
    });
    return "Got it—I’ll use that preference going forward.";
  }
}
