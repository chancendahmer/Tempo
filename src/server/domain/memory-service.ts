import { z } from "zod";

export const memoryCommandSchema = z.object({
  type: z.literal("remember_memory"),
  content: z.string().trim().min(1).max(500),
  category: z.enum(["preference", "fact", "pattern"]),
});

export type MemoryCommand = z.infer<typeof memoryCommandSchema>;

export type MemoryRecord = {
  id: string;
  content: string;
  category: "preference" | "pattern" | "fact" | "intervention_learning";
  confidence: number | null;
};

export interface MemoryRepository {
  retrieveRelevant(userId: string, now: Date, limit: number): Promise<MemoryRecord[]>;
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
  if (forget) return { type: "forget", query: forget[1].trim() };
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
    ?? trimmed.match(/^(.+?)\s+(?:is|are)\s+(?:one of\s+)?my\s+favou?rite\s+foods?[.!]*$/i);
  if (favoriteFood) {
    return {
      type: "favorite_food",
      content: `Favorite food: ${favoriteFood[1].replace(/[.!]+$/, "").trim()}.`,
    };
  }
  const remember = trimmed.match(/^remember(?: that)?\s+(.+)$/i);
  if (remember) {
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

  async executeCommand(input: { userId: string; messageId: string; command: MemoryCommand; now: Date }) {
    await this.repository.storeExplicit({
      userId: input.userId,
      content: input.command.content,
      category: input.command.category,
      sourceMessageId: input.messageId,
      now: input.now,
    });
    return input.command.content.toLowerCase().startsWith("favorite food:")
      ? `Added to your favorite-food list: ${input.command.content.replace(/^Favorite food:\s*/i, "").replace(/\.$/, "")}.`
      : "I’ll remember that. You can ask me to forget it anytime.";
  }

  async tryHandleCorrection(input: { userId: string; messageId: string; body: string; now: Date }) {
    const correction = parseMemoryCorrection(input.body);
    if (!correction) return null;
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
