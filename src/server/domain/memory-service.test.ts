import { describe, expect, it } from "vitest";
import { isSensitiveMemory, parseMemoryCorrection } from "./memory-service";

describe("memory corrections", () => {
  it("recognizes a lasting dessert preference and punctuated deletion", () => {
    expect(parseMemoryCorrection("I really like frozen blueberries and yogurt as a dessert.")).toEqual({ type: "favorite_food", content: "Favorite food: frozen blueberries and yogurt." });
    expect(parseMemoryCorrection("Forget yogurt.")).toEqual({ type: "forget", query: "yogurt" });
  });
  it.each(["My password is demo-only", "API key: fake-test-value", "My SSN is 123-45-6789", "My medical record says something"])("blocks sensitive memory %s", (content) => {
    expect(isSensitiveMemory(content)).toBe(true);
    expect(isSensitiveMemory("Favorite food: yogurt.")).toBe(false);
  });
  it("recognizes explicit deletion and preference corrections", () => {
    expect(parseMemoryCorrection("forget what you know about mornings")).toEqual({ type: "forget", query: "mornings" });
    expect(parseMemoryCorrection("that's not true")).toEqual({ type: "forget_recent" });
    expect(parseMemoryCorrection("Actually, I prefer gentle reminders.")).toEqual({
      type: "preference",
      content: "The user prefers gentle reminders.",
    });
    expect(parseMemoryCorrection("Remember that I usually focus best before lunch.")).toEqual({
      type: "remember",
      category: "pattern",
      content: "The user said: I usually focus best before lunch.",
    });
    expect(parseMemoryCorrection("Remember my thesis advisor is Dr. Lee.")).toEqual({
      type: "remember",
      category: "fact",
      content: "The user said: my thesis advisor is Dr. Lee.",
    });
    expect(parseMemoryCorrection("What should I do next?")).toBeNull();
  });

  it("starts and updates a favorite-food list from natural requests", () => {
    expect(parseMemoryCorrection("Keep a log of my favorite foods")).toEqual({
      type: "start_favorite_food_log",
      content: "The user wants Tempo to maintain a running favorite-food list and use it for meal suggestions.",
    });
    expect(parseMemoryCorrection("I want you to keep a log of my favorite foods and help me choose meals")).toEqual({
      type: "start_favorite_food_log",
      content: "The user wants Tempo to maintain a running favorite-food list and use it for meal suggestions.",
    });
    expect(parseMemoryCorrection("Add chicken tikka masala to my favorite foods")).toEqual({
      type: "favorite_food",
      content: "Favorite food: chicken tikka masala.",
    });
    expect(parseMemoryCorrection("My favorite foods are tacos and sushi.")).toEqual({
      type: "favorite_food",
      content: "Favorite food: tacos and sushi.",
    });
  });
});
