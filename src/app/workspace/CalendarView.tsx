"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiArrowRight, FiCalendar, FiChevronLeft, FiChevronRight, FiPlus, FiRefreshCw } from "react-icons/fi";
import type { Workspace } from "./workspace-data";
import { localDay } from "@/server/domain/life-items";
import s from "./workspace.module.css";
function offsetForPreview() { const n = -new Date().getTimezoneOffset(); return `${n >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(n) / 60)).padStart(2, "0")}:${String(Math.abs(n) % 60).padStart(2, "0")}`; }

type CalendarEvent = { id: string; title: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; editable: boolean };
export function CalendarView({ data, preview, ask, editTask }: { data: Workspace; preview: boolean; ask: (text: string) => void; editTask: (task: Workspace["tasks"][number]) => void }) {
  const [day, setDay] = useState(() => localDay(new Date(), data.timezone));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetched, setFetched] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const version = ++sequence.current;
    const load = async () => {
      setLoading(true); setError(""); setEvents([]);
      if (preview) { setEvents([{ id: "preview-event", title: "A little time for yourself", start: { dateTime: `${day}T14:00:00${offsetForPreview()}` }, end: { dateTime: `${day}T15:00:00${offsetForPreview()}` }, editable: true }]); setLoading(false); setFetched(new Date().toISOString()); return; }
      try {
        // Fetch a generous UTC envelope; filter events using the user's local date below.
        const center = new Date(`${day}T12:00:00Z`).getTime();
        const response = await fetch(`/api/account/calendar/events?start=${encodeURIComponent(new Date(center - 36 * 3600000).toISOString())}&end=${encodeURIComponent(new Date(center + 36 * 3600000).toISOString())}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        if (version === sequence.current && !controller.signal.aborted) { setEvents(payload.events); setFetched(payload.fetchedAt); setTruncated(payload.truncated); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Calendar unavailable."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load(); const interval = setInterval(() => { void load(); }, 60000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [day, data.timezone, preview, refresh]);
  const time = (value: string) => new Intl.DateTimeFormat(undefined, { timeZone: data.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
  const dayEvents = events.filter(event => event.start.date ? event.start.date <= day && (event.end.date ?? event.start.date) > day : event.start.dateTime && localDay(new Date(event.start.dateTime), data.timezone) <= day && localDay(new Date(new Date(event.end.dateTime ?? event.start.dateTime).getTime() - 1), data.timezone) >= day);
  const tasks = data.tasks.filter(task => task.dueAt && localDay(new Date(task.dueAt), data.timezone) === day);
  function move(delta: number) { const value = new Date(`${day}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + delta); setDay(value.toISOString().slice(0, 10)); }
  const days = Array.from({ length: 7 }, (_, index) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 3 + index); return { date: d.toISOString().slice(0, 10), weekday: new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(d), number: d.getUTCDate() }; });
  return <><div className={s.sectionHeading}><div className={s.row}><button className={s.iconButton} aria-label="Previous day" onClick={() => move(-1)}><FiChevronLeft /></button><input className={s.dateInput} type="date" aria-label="Calendar date" value={day} onChange={e => { if (e.target.value) setDay(e.target.value); }} /><button className={s.iconButton} aria-label="Next day" onClick={() => move(1)}><FiChevronRight /></button><button className={s.textButton} onClick={() => setDay(localDay(new Date(), data.timezone))}>Today</button></div><button className={s.primary} onClick={() => ask(`Help me schedule an event on ${day}.`)}><FiPlus /> Plan with Tempo</button></div>
    <div className={s.weekStrip}>{days.map(d => <button key={d.date} aria-pressed={d.date === day} onClick={() => setDay(d.date)}><span>{d.weekday}</span><strong>{d.number}</strong><i /></button>)}</div>
    <div className={s.calendarLayout}><article className={s.card}><div className={s.sectionHeading}><h2>Your day, together</h2><button className={s.iconButton} aria-label="Refresh Google Calendar" disabled={loading} onClick={() => setRefresh(n => n + 1)}><FiRefreshCw /></button></div><small>{data.timezone} · {preview ? "Sample calendar" : "Google primary calendar"}</small>{loading && <p role="status">Refreshing your calendar…</p>}{error && <p role="alert" className={s.foodNotice}>{error}</p>}{truncated && <p className={s.foodNotice}>Google returned more events than this view can display. Open Google Calendar for the full schedule.</p>}
      {dayEvents.map(event => <div className={s.eventCard} key={event.id}><div className={s.eventTime}>{event.start.date ? "All day" : event.start.dateTime ? time(event.start.dateTime) : ""}<small>{event.end.dateTime ? time(event.end.dateTime) : ""}</small></div><div className={s.grow}><span className={s.eyebrow}>GOOGLE CALENDAR</span><h3>{event.title}</h3><button className={s.textButton} onClick={() => ask(`Help me change the Google Calendar event “${event.title}” on ${day}.`)}>Discuss with Tempo <FiArrowRight /></button></div></div>)}
      {tasks.map(task => <button className={s.calendarTask} key={task.id} onClick={() => editTask(task)}><FiCalendar /><span>{task.dueAt ? time(task.dueAt) : ""}</span><strong>{task.title}</strong><small>{task.status === "completed" ? "Done" : `${task.estimatedMinutes ?? 25} min`}</small></button>)}
      {!loading && !error && !dayEvents.length && !tasks.length && <div className={s.empty}><FiSunPlaceholder /><h3>A little room to breathe</h3><p>No calendar events or scheduled tasks on this day.</p></div>}
      {data.reminders.filter(r => localDay(new Date(r.remindAt), data.timezone) === day).map(r => <div className={s.reminderEvent} key={r.id}><span>{time(r.remindAt)}</span><strong>{r.text}</strong><small>{r.status}</small></div>)}
    </article><aside><article className={s.card}><span className={`${s.tileIcon} ${s.lavender}`}><FiCalendar /></span><h3>Your Google Calendar</h3><p>{data.calendar?.status === "active" ? "Connected to your Tempo account." : "Connect your calendar to see events here."}</p><small>{fetched && !error ? `Events refreshed at ${time(fetched)}` : "Event access requires Google authorization."}</small><details className={s.inlineDetails}><summary>How calendar edits work</summary><p>Tempo asks you to confirm changes. Shared, recurring, and all-day event edits stay in Google Calendar.</p></details><Link className={s.secondary} href="/extensions">Manage connection <FiArrowRight /></Link><a className={s.textButton} href="https://calendar.google.com" target="_blank" rel="noreferrer">Open Google Calendar <FiArrowRight /></a></article></aside></div></>;
}
function FiSunPlaceholder() { return <FiCalendar />; }
