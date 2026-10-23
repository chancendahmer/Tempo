import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { withAiInvocationScope } from "../../domain/ai-invocation-scope";
import { getDatabase, type TempoDatabase } from "../client";
import { tasks } from "../schema";
import { fallbackTaskPresentation } from "../../domain/task-presentation";
import type { PresentationBatch, PresentationInput } from "../../adapters/llm/task-presentation";

/** One account per batch, bounded provider work, optimistic writes preserve edits and overrides. */
export async function enrichTaskPresentations(suggest: (input: PresentationInput[]) => Promise<PresentationBatch>, database: TempoDatabase = getDatabase()) {
  const [first] = await database.select({ userId: tasks.userId }).from(tasks).where(and(isNull(tasks.presentation), eq(tasks.status, "not_started"))).orderBy(asc(tasks.updatedAt)).limit(1);
  if (!first) return { saved: 0, source: "none" as const };
  const pending = await database.select({ id: tasks.id, title: tasks.title, estimatedMinutes: tasks.estimatedMinutes }).from(tasks).where(and(eq(tasks.userId, first.userId), isNull(tasks.presentation), eq(tasks.status, "not_started"))).orderBy(asc(tasks.createdAt)).limit(8);
  let suggestions: PresentationBatch | undefined;
  try { suggestions = await withAiInvocationScope({ accountId: first.userId, executionId: randomUUID() }, () => suggest(pending)); } catch { /* Keep capture usable; no endless paid retry loop. */ }
  let saved = 0;
  for (const task of pending) {
    const suggestion = suggestions?.tasks.find(item => item.id === task.id);
    const presentation = suggestion ? { category: suggestion.category, focusMinutes: Math.min(suggestion.focusMinutes, task.estimatedMinutes ?? 60), title: task.title, source: "ai" as const } : fallbackTaskPresentation(task.title, task.estimatedMinutes);
    const changed = await database.update(tasks).set({ presentation }).where(and(eq(tasks.id, task.id), eq(tasks.userId, first.userId), eq(tasks.title, task.title), sql`${tasks.estimatedMinutes} is not distinct from ${task.estimatedMinutes}`, eq(tasks.status, "not_started"), isNull(tasks.presentation))).returning({ id: tasks.id });
    saved += changed.length;
  }
  return { saved, source: suggestions ? "ai" as const : "fallback" as const };
}
