export type CalendarTokens = {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes: string[];
};

export type BusyWindow = { start: Date; end: Date };

export class CalendarAuthorizationError extends Error {
  constructor(message = "Calendar authorization is no longer valid") {
    super(message);
    this.name = "CalendarAuthorizationError";
  }
}

export interface CalendarOAuthProvider {
  authorizationUrl(input: { state: string; codeChallenge: string }): string;
  exchangeCode(input: { code: string; codeVerifier: string }): Promise<CalendarTokens>;
}

export interface CalendarDataProvider {
  getBusyWindows(input: {
    accessToken?: string | null;
    refreshToken: string;
    expiresAt?: Date | null;
    timeMin: Date;
    timeMax: Date;
  }): Promise<{ windows: BusyWindow[]; tokens: CalendarTokens }>;
}
