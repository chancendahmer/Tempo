import { isExplicitReminderRequest } from "./reminder-commands";
import { latestLinkedExchange, type ConversationHistoryMessage } from "./conversation-history";

/** A delivered reminder is a referent, never authorization. Ignore unrelated
 * notifications after a clarification so they cannot replace its subject. */
export function reminderReference(input: { message: string; history?: ConversationHistoryMessage[] }) {
  const history = input.history ?? [];
  const exchange = latestLinkedExchange(history);
  let lastHuman = -1, lastNotification = -1;
  history.forEach((item, index) => {
    if (item.role === "user") lastHuman = index;
    if (item.role === "assistant" && item.relatedReminder) lastNotification = index;
  });
  if (lastNotification < 0) return;
  if (lastNotification > lastHuman) {
    if (!isExplicitReminderRequest(input.message)) return;
  } else if (!exchange || !isExplicitReminderRequest(exchange.request.content)) return;
  const notification = history[lastNotification];
  // At most one human request may connect a notification to a time answer.
  if (history.slice(lastNotification + 1).filter(item => item.role === "user").length > 1) return;
  return notification.relatedReminder;
}
