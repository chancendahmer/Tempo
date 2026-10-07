import { expect, it } from "vitest";
import { CalendarRequestError, calendarRequestFailureReply } from "./calendar-request-error";
import { CalendarAuthorizationError } from "../adapters/calendar/calendar-provider";

it("distinguishes reconnect, input, and transient failures without exposing provider errors", () => {
  expect(calendarRequestFailureReply(new CalendarAuthorizationError())).toContain("reconnect");
  expect(calendarRequestFailureReply(new CalendarRequestError("What end time should I use?"))).toBe("What end time should I use?");
  const reply = calendarRequestFailureReply(new Error("private provider details"));
  expect(reply).toContain("temporarily unavailable");
  expect(reply).not.toMatch(/reconnect|private provider/);
});
