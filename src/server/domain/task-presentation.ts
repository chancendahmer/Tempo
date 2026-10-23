import { z } from "zod";

export const taskCategorySchema = z.enum(["work", "shopping", "food", "fitness", "home", "personal"]);
export type TaskCategory = z.infer<typeof taskCategorySchema>;
export const taskPresentationSchema = z.object({
  category: taskCategorySchema,
  focusMinutes: z.number().int().min(1).max(60),
  source: z.enum(["ai", "manual", "fallback"]),
  title: z.string().max(240),
});
export type TaskPresentation = z.infer<typeof taskPresentationSchema>;
export const taskCategoryLabels: Record<TaskCategory, string> = { work: "Work & study", shopping: "Shopping", food: "Food", fitness: "Movement", home: "Home", personal: "Personal" };

/** Immediate, conservative defaults while optional model enrichment runs. Not an AI result. */
export function fallbackTaskPresentation(title: string, estimatedMinutes?: number | null): TaskPresentation {
  let category: TaskCategory = "work";
  if (/\b(write|essay|research|paper|report|presentation|homework)\b/i.test(title)) category = "work";
  else if (/\b(grocer\w*|buy|pick up|shop\w*)\b/i.test(title)) category = "shopping";
  else if (/\b(cook|meal|recipe|breakfast|lunch|dinner|bake)\b/i.test(title)) category = "food";
  else if (/\b(workout|gym|yoga|jog|exercise|calisthenics|strength|walk|run|upper body|lower body|push pull legs)\b/i.test(title) && !/\b(write|essay|research|paper|report|presentation)\b/i.test(title)) category = "fitness";
  else if (/\b(laundry|tidy|dishes|vacuum|clean|curtains)\b/i.test(title)) category = "home";
  else if (/\b(call|haircut|appointment|book|shower|dress)\b/i.test(title)) category = "personal";
  const quick = /\b(send|email|text|book|pack|reply)\b/i.test(title);
  return { category, focusMinutes: estimatedMinutes ? Math.max(1, Math.min(25, estimatedMinutes)) : quick ? 5 : 10, title, source: "fallback" };
}

export function taskPresentation(task: { title: string; estimatedMinutes?: number | null; presentation?: unknown }): TaskPresentation {
  const stored = taskPresentationSchema.safeParse(task.presentation);
  if (stored.success) {
    if (stored.data.source === "manual") return stored.data;
    if (stored.data.title === task.title && (task.estimatedMinutes == null || stored.data.focusMinutes <= task.estimatedMinutes)) return stored.data;
  }
  return fallbackTaskPresentation(task.title, task.estimatedMinutes);
}
