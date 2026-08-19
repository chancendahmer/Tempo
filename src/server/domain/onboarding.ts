export type OnboardingState =
  | "awaiting_consent"
  | "introduction"
  | "timezone"
  | "quiet_hours"
  | "coaching_style"
  | "first_task"
  | "calendar"
  | "complete";

export type OnboardingResult = {
  handled: boolean;
  nextState: OnboardingState;
  reply?: string;
  createTaskTitle?: string;
  updates?: {
    timezone?: string;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    coachingTone?: "gentle" | "balanced" | "direct";
  };
};

const TIMEZONE_ALIASES: Record<string, string> = {
  "eastern": "America/New_York",
  "eastern time": "America/New_York",
  "et": "America/New_York",
  "central": "America/Chicago",
  "central time": "America/Chicago",
  "ct": "America/Chicago",
  "mountain": "America/Denver",
  "mountain time": "America/Denver",
  "mt": "America/Denver",
  "pacific": "America/Los_Angeles",
  "pacific time": "America/Los_Angeles",
  "pt": "America/Los_Angeles",
  "alaska": "America/Anchorage",
  "hawaii": "Pacific/Honolulu",
  "utc": "UTC",
};

export function parseTimezone(input: string): string | null {
  const normalized = input.trim().toLowerCase().replace(/[.!]$/, "");
  const alias = TIMEZONE_ALIASES[normalized];
  if (alias) return alias;

  const candidate = input.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return null;
  }
}

function parseClockPart(rawValue: string, rawMeridiem?: string): string | null {
  const [rawHour, rawMinute = "0"] = rawValue.split(":");
  let hour = Number(rawHour);
  const minute = Number(rawMinute);
  const meridiem = rawMeridiem?.toLowerCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

export function parseQuietHours(input: string): { start: string; end: string } | null {
  const match = input
    .trim()
    .toLowerCase()
    .match(/(?:from\s+)?(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*(?:to|until|-|–)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?/);
  if (!match) return null;

  const start = parseClockPart(match[1], match[2]);
  const end = parseClockPart(match[3], match[4]);
  return start && end && start !== end ? { start, end } : null;
}

export function parseCoachingTone(input: string): "gentle" | "balanced" | "direct" | null {
  const normalized = input.toLowerCase();
  if (/\b(direct|blunt|firm|straight)\b/.test(normalized)) return "direct";
  if (/\b(gentle|soft|kind|encouraging)\b/.test(normalized)) return "gentle";
  if (/\b(balance|balanced|mix|middle|either|both)\b/.test(normalized)) return "balanced";
  return null;
}

export function commitmentTitle(input: string): string | null {
  const title = input
    .trim()
    .replace(/^(i\s+need\s+to|i\s+want\s+to|i'?m\s+trying\s+to|my\s+task\s+is)\s+/i, "")
    .replace(/[.!]+$/, "")
    .trim();
  return title.length >= 3 ? title.slice(0, 240) : null;
}

export function handleOnboardingMessage(state: OnboardingState, message: string): OnboardingResult {
  switch (state) {
    case "awaiting_consent":
      return { handled: true, nextState: state };
    case "introduction":
    case "first_task": {
      const title = commitmentTitle(message);
      if (!title) {
        return {
          handled: true,
          nextState: state,
          reply: "What’s one specific thing you want Tempo to help you start?",
        };
      }
      return {
        handled: true,
        nextState: "timezone",
        createTaskTitle: title,
        reply: `Got it: ${title}. What time zone are you in? You can say Eastern, Pacific, or an IANA zone like America/Chicago.`,
      };
    }
    case "timezone": {
      const timezone = parseTimezone(message);
      if (!timezone) {
        return {
          handled: true,
          nextState: state,
          reply: "I couldn’t place that time zone. Try Eastern, Central, Mountain, Pacific, or a zone like America/New_York.",
        };
      }
      return {
        handled: true,
        nextState: "quiet_hours",
        updates: { timezone },
        reply: "When should I stay quiet? For example: 11pm to 7am.",
      };
    }
    case "quiet_hours": {
      const quietHours = parseQuietHours(message);
      if (!quietHours) {
        return {
          handled: true,
          nextState: state,
          reply: "Send a quiet window like “11pm to 7am” or “22:30 to 06:30.”",
        };
      }
      return {
        handled: true,
        nextState: "coaching_style",
        updates: { quietHoursStart: quietHours.start, quietHoursEnd: quietHours.end },
        reply: "Last preference: should my nudges feel gentle, direct, or balanced?",
      };
    }
    case "coaching_style": {
      const coachingTone = parseCoachingTone(message);
      if (!coachingTone) {
        return {
          handled: true,
          nextState: state,
          reply: "Choose gentle, direct, or balanced. You can change this anytime.",
        };
      }
      return {
        handled: true,
        nextState: "calendar",
        updates: { coachingTone },
        reply: "Perfect. Next, connect Google Calendar so I can notice useful open windows. I’ll send the secure link next.",
      };
    }
    case "calendar":
      if (/\b(skip|not now|later|no calendar)\b/i.test(message)) {
        return {
          handled: true,
          nextState: "complete",
          reply: "Setup complete. I’ll work from your tasks for now; text “connect calendar” anytime. Text STOP to opt out.",
        };
      }
      return {
        handled: false,
        nextState: state,
      };
    case "complete":
      return { handled: false, nextState: state };
  }
}
