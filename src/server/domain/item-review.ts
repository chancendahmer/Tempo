
export const DAY_MS = 86_400_000;
export type ReviewTarget = { kind: "task" | "goal" | "reminder" | "life"; id: string; title: string; revision: string; overdue: boolean };

export function reviewIsDue(updatedAt: Date, dueAt: Date | null, now: Date) {
  // Recent edits/progress suppress reviews even if the old deadline has passed.
  return now.getTime() - updatedAt.getTime() >= DAY_MS && (dueAt ? now.getTime() - dueAt.getTime() >= DAY_MS : now.getTime() - updatedAt.getTime() >= 14 * DAY_MS);
}

export function itemReviewMessage(target: ReviewTarget) {
  const title = target.title.length > 120 ? `${target.title.slice(0, 117)}…` : target.title;
  return `Still need “${title}”? ${target.overdue ? "Its date has passed." : "It’s been sitting for a while."} Reply KEEP to leave it, REMOVE to take it off your list, or LATER to revisit it in two weeks. Nothing is removed unless you choose.`;
}

export interface ItemReviewResponder { respond(userId: string, messageId: string, body: string, now: Date): Promise<string | null> }
