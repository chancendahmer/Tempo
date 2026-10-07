import { createHash } from "node:crypto";
import { google, calendar_v3 } from "googleapis";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getServerEnv, requireEnv } from "../../config/env";
import { cleanupDeliveryEnabled, proactiveDeliveryEnabled } from "../../config/proactive-delivery";
import { getDatabase, TempoDatabase } from "../../db/client";
import { users } from "../../db/schema";
import { DrizzleCalendarSyncRepository } from "../../db/repositories/calendar-sync-repository";
import { AssistantIntegrations, CalendarChange, calendarChangeSchema } from "../../domain/assistant-commands";
import { formatReminderTime } from "../../domain/reminder-service";
import { decryptField, encryptField } from "../../security/field-encryption";
import { CalendarRequestError } from "../../domain/calendar-request-error";
import { CalendarAuthorizationError } from "./calendar-provider";

export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";
const proposalSchema = z.object({
  userId: z.uuid(), sourceMessageId: z.uuid(), expiresAt: z.number(), change: calendarChangeSchema,
  event: z.object({ id: z.string(), etag: z.string(), title: z.string(), start: z.string(), end: z.string() }).optional(),
});

export function validateCalendarRange(start: string, end: string, maxDays = 31) {
  const from = new Date(start), to = new Date(end);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > maxDays * 86_400_000) {
    throw new CalendarRequestError(`Choose a valid time range no longer than ${maxDays} days.`);
  }
}

function assertEditable(event: calendar_v3.Schema$Event) {
  if (event.attendees?.length || event.recurrence?.length || event.recurringEventId || event.organizer?.self === false || !event.start?.dateTime || !event.end?.dateTime) {
    throw new CalendarRequestError("For this demo I can edit individual, timed personal events without guests. Please edit shared, all-day, or recurring events in Google Calendar.");
  }
}

function providerCode(error: unknown) {
  return (error as { code?: number; response?: { status?: number } })?.response?.status ?? (error as { code?: number })?.code;
}

function isCalendarAuthorizationFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
  return providerCode(error) === 401 || (providerCode(error) === 403 && /insufficient.?permissions?/i.test(message)) || /invalid_grant|unauthorized/i.test(message);
}

export class CalendarAssistantIntegrations implements AssistantIntegrations {
  constructor(private readonly database: TempoDatabase = getDatabase()) {}

  async hasConnectedCalendar(userId: string): Promise<boolean> {
    return Boolean(await new DrizzleCalendarSyncRepository(this.database).getActiveConnection(userId));
  }

  private async calendar(userId: string) {
    const env = requireEnv(["FIELD_ENCRYPTION_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"]);
    const connection = await new DrizzleCalendarSyncRepository(this.database).getActiveConnection(userId);
    if (!connection) {
      throw new CalendarRequestError("Connect or reconnect Google Calendar with event access on the Extensions page first.");
    }
    if (!connection.scopes.includes(CALENDAR_EVENTS_SCOPE)) {
      await new DrizzleCalendarSyncRepository(this.database).markRequiresReauth(connection.id);
      throw new CalendarAuthorizationError("Google Calendar needs updated event access. Reconnect to continue.");
    }
    const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
    auth.setCredentials({ refresh_token: decryptField(connection.encryptedRefreshToken, env.FIELD_ENCRYPTION_KEY!) });
    return google.calendar({ version: "v3", auth });
  }

  private async authorizedCalendarRequest<T>(userId: string, request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (!isCalendarAuthorizationFailure(error)) throw error;
      const repository = new DrizzleCalendarSyncRepository(this.database);
      const connection = await repository.getActiveConnection(userId);
      if (connection) await repository.markRequiresReauth(connection.id);
      throw new CalendarAuthorizationError();
    }
  }

  async status(userId: string) {
    const env = getServerEnv();
    const connection = await new DrizzleCalendarSyncRepository(this.database).getActiveConnection(userId);
    const [preferences] = await this.database.select({ proactiveOptIn: users.proactiveOptIn, dailyCap: users.dailyInterventionCap, cooldownMinutes: users.interventionCooldownMinutes, status: users.status, pausedUntil: users.pausedUntil }).from(users).where(eq(users.id, userId)).limit(1);
    const deliveryEnabled = proactiveDeliveryEnabled(env, userId);
    const accountActive = preferences ? preferences.status === "active" && !(preferences.pausedUntil && preferences.pausedUntil > new Date()) : null;
    const coaching = !preferences ? "Account settings unavailable; current opt-in could not be verified"
      : !preferences.proactiveOptIn ? "You have not opted into automatic check-ins; nothing was changed"
      : !deliveryEnabled ? "You are opted in, but operator delivery is disabled for your account; nothing was changed"
      : !accountActive ? "You are opted in, but your account is paused or inactive; automatic check-ins are withheld"
      : `Automatic task check-ins are enabled for your account, up to ${Math.min(3, preferences.dailyCap)} per day and at least ${Math.max(120, preferences.cooldownMinutes)} minutes apart. Tempo evaluates opportunities in the background; falling behind does not guarantee a text. Consent, quiet hours, calendar availability, recent conversation, cooldown and daily caps must all pass. No settings were changed`;
    return JSON.stringify({
      calendar: !connection ? "not connected" : connection.scopes.includes(CALENDAR_EVENTS_SCOPE) ? "agenda and confirmed personal event edits" : "free/busy only; reconnect for event access",
      webSearch: env.ASSISTANT_WEB_SEARCH_ENABLED ? "enabled; requires provider account access" : "disabled by operator",
      memory: "available", tasksAndReminders: "available",
        workspace: "Tempo routines, recipes, meal plans, food logs, workouts, groceries and notes; edits appear after refresh",
        wakeAndWindDown: "manual sunrise/sunset screen sessions with optional synthesized birds/waves; start in Wake & Wind Down; no scheduled wake alarms, background reliability or hardware brightness/light control",
      proactiveCoaching: coaching,
      cleanupCheckins: cleanupDeliveryEnabled(env, userId) && preferences?.proactiveOptIn && accountActive
        ? "Occasional overdue or untouched-item reviews are enabled, at most once a week. Quiet hours, consent, calendar checks and delivery limits apply. Tempo asks before removing anything"
        : "Cleanup outreach is not active for this account; operator permission, account activity and check-in opt-in are required",
      proactiveSettings: { optedIn: preferences?.proactiveOptIn ?? null, deliveryEnabled, accountActive, dailyCap: preferences ? Math.min(3, preferences.dailyCap) : null, settingsChanged: false },
      otherAccounts: "not connected: email, Apple Calendar, Google Tasks, shopping, health, and other third-party apps",
      manageConnections: `${env.APP_BASE_URL}/extensions`,
    });
  }

  async agenda(userId: string, start: string, end: string) {
    validateCalendarRange(start, end);
    const calendar = await this.calendar(userId);
    const { data } = await this.authorizedCalendarRequest(userId, () => calendar.events.list({ calendarId: "primary", timeMin: start, timeMax: end, singleEvents: true, orderBy: "startTime", maxResults: 30 }, { timeout: 15_000 }));
    return JSON.stringify({ events: (data.items ?? []).map((event) => ({
      id: event.id, title: event.summary ?? "Untitled event", start: event.start, end: event.end,
      editable: !event.attendees?.length && !event.recurringEventId && !!event.start?.dateTime && event.organizer?.self !== false,
    })), truncated: !!data.nextPageToken });
  }

  async proposeCalendarChange(userId: string, sourceMessageId: string, change: CalendarChange, timezone: string, now: Date) {
    const calendar = await this.calendar(userId);
    let event: z.infer<typeof proposalSchema>["event"];
    if (change.operation !== "create") {
      const { data } = await this.authorizedCalendarRequest(userId, () => calendar.events.get({ calendarId: "primary", eventId: change.eventId }, { timeout: 15_000 }));
      assertEditable(data);
      if (!data.etag || !data.id) throw new CalendarRequestError("Could not verify this calendar event. Please try again.");
      event = { id: data.id, etag: data.etag, title: data.summary ?? "Untitled event", start: data.start!.dateTime!, end: data.end!.dateTime! };
      if (change.operation === "update" && !change.title && !change.start && !change.end) throw new CalendarRequestError("What would you like to change about that event?");
    }
    const title = change.operation === "delete" ? event!.title : change.title ?? event!.title;
    const start = change.operation === "delete" ? event!.start : change.start ?? event!.start;
    const end = change.operation === "delete" ? event!.end : change.end ?? event!.end;
    if (change.operation !== "delete") {
      validateCalendarRange(start, end, 1);
      if (new Date(start) <= now) throw new CalendarRequestError("That event time has passed. What future time should I use?");
    }
    const summary = `${change.operation === "create" ? "Add" : change.operation === "update" ? "Update" : "Delete"} “${title}” ${formatReminderTime(new Date(start), timezone)}${change.operation === "delete" ? "" : ` – ${formatReminderTime(new Date(end), timezone)}`}? Reply YES to confirm or NO to leave your calendar unchanged.`;
    const env = requireEnv(["FIELD_ENCRYPTION_KEY"]);
    return { summary, token: encryptField(JSON.stringify({ userId, sourceMessageId, change, event, expiresAt: now.getTime() + 15 * 60_000 }), env.FIELD_ENCRYPTION_KEY!) };
  }

  async confirmCalendarChange(userId: string, token: string, now: Date) {
    const env = requireEnv(["FIELD_ENCRYPTION_KEY"]);
    const proposal = proposalSchema.parse(JSON.parse(decryptField(token, env.FIELD_ENCRYPTION_KEY!)));
    if (proposal.userId !== userId || proposal.expiresAt <= now.getTime()) throw new CalendarRequestError("That calendar confirmation has expired. Please request the change again.");
    const calendar = await this.calendar(userId);
    const { change, event } = proposal;
    if (change.operation === "create") {
      if (new Date(change.start) <= now) throw new CalendarRequestError("That start time has passed. Please choose a future time.");
      const id = `tempo${createHash("sha256").update(`${userId}:${proposal.sourceMessageId}`).digest("hex").slice(0, 40)}`;
      try {
        await this.authorizedCalendarRequest(userId, () => calendar.events.insert({ calendarId: "primary", sendUpdates: "none", requestBody: {
          id, summary: change.title, start: { dateTime: change.start }, end: { dateTime: change.end },
        } }, { timeout: 15_000 }));
      } catch (error) {
        if (providerCode(error) !== 409) throw error;
        const { data } = await this.authorizedCalendarRequest(userId, () => calendar.events.get({ calendarId: "primary", eventId: id }, { timeout: 15_000 }));
        assertEditable(data);
        if (data.status === "cancelled" || data.summary !== change.title
          || new Date(data.start!.dateTime!).getTime() !== new Date(change.start).getTime()
          || new Date(data.end!.dateTime!).getTime() !== new Date(change.end).getTime()) {
          throw new CalendarRequestError("This calendar request was already handled and changed later. Please check your calendar.");
        }
      }
      return `Added to Google Calendar: ${change.title}.`;
    }
    if (!event) throw new CalendarRequestError("Missing calendar confirmation details.");
    let current: calendar_v3.Schema$Event;
    try {
      current = (await this.authorizedCalendarRequest(userId, () => calendar.events.get({ calendarId: "primary", eventId: event.id }, { timeout: 15_000 }))).data;
    } catch (error) {
      if (change.operation === "delete" && [404, 410].includes(providerCode(error) ?? 0)) return `Removed from Google Calendar: ${event.title}.`;
      throw error;
    }
    if (change.operation === "delete" && current.status === "cancelled") return `Removed from Google Calendar: ${event.title}.`;
    assertEditable(current);
    const desired = change.operation === "update" ? { title: change.title ?? event.title, start: change.start ?? event.start, end: change.end ?? event.end } : null;
    if (desired && current.summary === desired.title && new Date(current.start!.dateTime!).getTime() === new Date(desired.start).getTime() && new Date(current.end!.dateTime!).getTime() === new Date(desired.end).getTime()) return `Updated Google Calendar: ${desired.title}.`;
    if (current.etag !== event.etag) throw new CalendarRequestError("That event changed since I asked. Please request the change again so you can confirm the latest version.");
    const options = { timeout: 15_000, headers: { "If-Match": event.etag } };
    if (change.operation === "delete") {
      await this.authorizedCalendarRequest(userId, () => calendar.events.delete({ calendarId: "primary", eventId: event.id, sendUpdates: "none" }, options));
      return `Removed from Google Calendar: ${event.title}.`;
    }
    if (new Date(desired!.start) <= now) throw new CalendarRequestError("That start time has passed. Please choose a future time.");
    await this.authorizedCalendarRequest(userId, () => calendar.events.patch({ calendarId: "primary", eventId: event.id, sendUpdates: "none", requestBody: {
      summary: desired!.title, start: { dateTime: desired!.start }, end: { dateTime: desired!.end },
    } }, options));
    return `Updated Google Calendar: ${desired!.title}.`;
  }

  async setCheckins(userId: string, enabled: boolean, dailyCap: number) {
    await this.database.update(users).set({ proactiveOptIn: enabled, dailyInterventionCap: enabled ? Math.max(1, Math.min(3, dailyCap)) : 0, interventionCooldownMinutes: 120, updatedAt: new Date() }).where(eq(users.id, userId));
    const env = getServerEnv();
    if (!enabled) return "Optional task check-ins are off. Your requested reminders are unchanged.";
    if (!proactiveDeliveryEnabled(env, userId) && cleanupDeliveryEnabled(env, userId)) return "Optional cleanup check-ins are on: I can ask about an overdue or untouched item, at most once a week. Quiet hours and delivery limits apply, and I ask before removing anything. Other automatic coaching is not enabled yet.";
    if (!proactiveDeliveryEnabled(env, userId)) return "Your check-in preference is saved, but proactive delivery is not enabled by the demo operator yet. Your requested reminders still work.";
    return `I can check in up to ${dailyCap} ${dailyCap === 1 ? "time" : "times"} a day, at least two hours apart, when your calendar shows a suitable opening. Quiet hours still apply. You can ask me to turn check-ins off anytime.`;
  }
}
