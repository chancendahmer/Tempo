/** Only application-authored explanations are safe to show in conversation. */
export class CalendarRequestError extends Error {}

export function calendarRequestFailureReply(error: unknown) {
  return error instanceof CalendarRequestError ? error.message
    : "Google Calendar is temporarily unavailable. I haven’t saved this change. Please try again shortly.";
}
