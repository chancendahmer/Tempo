import { google } from "googleapis";
import { CodeChallengeMethod } from "google-auth-library";
import { requireEnv } from "../../config/env";
import { BusyWindow, CalendarAuthorizationError, CalendarDataProvider, CalendarOAuthProvider, CalendarTokens } from "./calendar-provider";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.freebusy",
] as const;

function oauthClient() {
  const env = requireEnv(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"]);
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID!, env.GOOGLE_CLIENT_SECRET!, env.GOOGLE_REDIRECT_URI!);
}

function tokensFromCredentials(credentials: {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string;
}): CalendarTokens {
  return {
    accessToken: credentials.access_token,
    refreshToken: credentials.refresh_token,
    expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    scopes: credentials.scope?.split(" ").filter(Boolean) ?? [...GOOGLE_CALENDAR_SCOPES],
  };
}

export class GoogleCalendarProvider implements CalendarOAuthProvider, CalendarDataProvider {
  authorizationUrl(input: { state: string; codeChallenge: string }): string {
    return oauthClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [...GOOGLE_CALENDAR_SCOPES],
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      include_granted_scopes: false,
    });
  }

  async exchangeCode(input: { code: string; codeVerifier: string }) {
    const client = oauthClient();
    const { tokens } = await client.getToken({ code: input.code, codeVerifier: input.codeVerifier });
    return tokensFromCredentials(tokens);
  }

  async getBusyWindows(input: {
    accessToken?: string | null;
    refreshToken: string;
    expiresAt?: Date | null;
    timeMin: Date;
    timeMax: Date;
  }) {
    const client = oauthClient();
    client.setCredentials({
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      expiry_date: input.expiresAt?.getTime(),
    });
    const calendar = google.calendar({ version: "v3", auth: client });
    let response;
    try {
      response = await calendar.freebusy.query({
        requestBody: {
          timeMin: input.timeMin.toISOString(),
          timeMax: input.timeMax.toISOString(),
          items: [{ id: "primary" }],
        },
      });
    } catch (error) {
      const candidate = error as { code?: number; response?: { status?: number }; message?: string };
      if (candidate.code === 401 || candidate.response?.status === 401 || /invalid_grant|unauthorized/i.test(candidate.message ?? "")) {
        throw new CalendarAuthorizationError();
      }
      throw error;
    }
    const windows: BusyWindow[] = [];
    for (const busy of response.data.calendars?.primary?.busy ?? []) {
      if (!busy.start || !busy.end) continue;
      const start = new Date(busy.start);
      const end = new Date(busy.end);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
        windows.push({ start, end });
      }
    }
    return { windows, tokens: tokensFromCredentials(client.credentials) };
  }
}
