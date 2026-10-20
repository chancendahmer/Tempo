"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { Workspace } from "./workspace-data";
import { calendarEventSchema, type CalendarEvent } from "./calendar-event-model";
export type { CalendarEvent } from "./calendar-event-model";

type CalendarState = { events?: CalendarEvent[]; error: string; loading: boolean; requiresReconnect: boolean; fetched: string; truncated: boolean };
const emptyState: CalendarState = { error: "", loading: true, requiresReconnect: false, fetched: "", truncated: false };
const disconnectedState: CalendarState = { events: [], error: "", loading: false, requiresReconnect: false, fetched: "", truncated: false };
const agendaSchema = z.object({ events: z.array(calendarEventSchema), fetchedAt: z.iso.datetime({ offset: true }), truncated: z.boolean().optional() });

/** Fetch only through the signed-in account endpoint; reject malformed provider data. */
export async function fetchCalendarEvents(day: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<CalendarState> {
  const center = new Date(`${day}T12:00:00Z`).getTime();
  const response = await fetcher(`/api/account/calendar/events?start=${encodeURIComponent(new Date(center - 36 * 3600000).toISOString())}&end=${encodeURIComponent(new Date(center + 36 * 3600000).toISOString())}`, { cache: "no-store", signal });
  const payload = await response.json();
  if (!response.ok) return { error: typeof payload.error === "string" ? payload.error : "Calendar unavailable. Try refreshing or check your connection.", loading: false, requiresReconnect: payload.code === "calendar_reauth_required", fetched: "", truncated: false };
  const agenda = agendaSchema.parse(payload);
  return { events: agenda.events, error: "", loading: false, requiresReconnect: false, fetched: agenda.fetchedAt, truncated: !!agenda.truncated };
}

/** Keep requests inside this mounted account view; never use a shared calendar cache. */
export function useCalendarEvents(data: Workspace, day: string, preview: boolean, revision = 0) {
  const disconnected = !preview && (!data.calendar || data.calendar.status === "disconnected");
  const key = JSON.stringify([day, data.timezone, data.profile.phoneLast4, data.calendar?.status, preview, revision]);
  const [result, setResult] = useState<{ key: string; state: CalendarState }>({ key: "", state: emptyState });
  useEffect(() => {
    if (disconnected) return;
    const controller = new AbortController();
    let running = false;
    async function load() {
      if (running || controller.signal.aborted) return;
      running = true;
      // An async boundary keeps refresh updates out of the synchronous effect body.
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setResult(current => ({ key, state: { ...(current.key === key ? current.state : emptyState), loading: true, error: "" } }));
      if (preview) {
        setResult({ key, state: { events: (data.demoCalendarEvents ?? []).map(event => ({ id: event.id, title: event.title, start: { dateTime: event.startsAt }, end: { dateTime: event.endsAt }, editable: false })), error: "", loading: false, requiresReconnect: false, fetched: new Date().toISOString(), truncated: false } });
        running = false;
        return;
      }
      try {
        const state = await fetchCalendarEvents(day, controller.signal);
        if (!controller.signal.aborted) setResult({ key, state });
      } catch {
        if (!controller.signal.aborted) setResult({ key, state: { error: "Calendar couldn’t refresh. Check your connection and try again.", loading: false, requiresReconnect: false, fetched: "", truncated: false } });
      } finally { running = false; }
    }
    void load();
    const interval = setInterval(() => void load(), 60000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [key, day, data.demoCalendarEvents, preview, disconnected]);
  // Hide results from an earlier day/connection immediately, before its effect is cleaned up.
  return { ...(disconnected ? disconnectedState : result.key === key ? result.state : emptyState), disconnected };
}
