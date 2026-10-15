"use client";
import { taskDueLabel } from "./task-due-label";
import Link from "next/link";
import { useState } from "react";
import { useCalendarEvents } from "./use-calendar-events";
import { calendarEventOccursOnDay } from "./calendar-event-model";
import { FiArrowRight, FiBell, FiCalendar, FiCheckSquare, FiChevronLeft, FiChevronRight, FiPlus, FiRefreshCw, FiSquare } from "react-icons/fi";
import type { Workspace } from "./workspace-data";
import { localDay } from "../../server/domain/life-items";
import s from "./calendar.module.css";

export function CalendarView({ data, preview, ask, editTask }: { data: Workspace; preview: boolean; ask: (text: string) => void; editTask: (task: Workspace["tasks"][number]) => void }) {
  const [day, setDay] = useState(() => localDay(new Date(), data.timezone));
  const [refresh, setRefresh] = useState(0);
  const { events = [], error, requiresReconnect, loading, fetched, truncated, disconnected } = useCalendarEvents(data, day, preview, refresh);
  const time = (value: string) => new Intl.DateTimeFormat(undefined, { timeZone: data.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
  const dayEvents = events.filter(event => calendarEventOccursOnDay(event, day, data.timezone));
  const tasks = data.tasks.filter(task => task.dueAt && localDay(new Date(task.dueAt), data.timezone) === day);
  const reminders = data.reminders.filter(r => localDay(new Date(r.remindAt), data.timezone) === day);
  const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  const agenda = [
    ...dayEvents.map(event => ({
      id: `event-${event.id}`, at: event.start.dateTime ? Date.parse(event.start.dateTime) : -Infinity,
      content: <div className={s.entry} data-kind="event">
        <div className={s.time}>{event.start.date ? "All day" : event.start.dateTime ? time(event.start.dateTime) : ""}<small>{event.end.dateTime ? time(event.end.dateTime) : ""}</small></div>
        <FiCalendar className={s.entryIcon} aria-hidden="true" />
        <div className={s.entryBody}><span className={s.source}>{preview ? "Sample event" : "Google Calendar"}</span><h3>{event.title}</h3><button className={s.textButton} onClick={() => ask(`Help me change the Google Calendar event “${event.title}” on ${day}.`)}>Discuss with Tempo <FiArrowRight aria-hidden="true" /></button></div>
      </div>,
    })),
    ...tasks.map(task => ({
      id: `task-${task.id}`, at: Date.parse(task.dueAt!),
      content: <button className={`${s.entry} ${s.task}`} onClick={() => editTask(task)}>
        <span className={s.time}>{taskDueLabel(task.dueAt!, data.timezone)}</span>{task.status === "completed" ? <FiCheckSquare className={s.entryIcon} aria-hidden="true" /> : <FiSquare className={s.entryIcon} aria-hidden="true" />}
        <span className={s.entryBody}><span className={s.source}>To-do</span><strong>{task.title}</strong><small>{task.status === "completed" ? "Done" : `${task.estimatedMinutes ?? 25} min`} · Edit task <FiArrowRight aria-hidden="true" /></small></span>
      </button>,
    })),
    ...reminders.map(r => ({
      id: `reminder-${r.id}`, at: Date.parse(r.remindAt),
      content: <div className={s.entry} data-kind="reminder"><span className={s.time}>{time(r.remindAt)}</span><FiBell className={s.entryIcon} aria-hidden="true" /><div className={s.entryBody}><span className={s.source}>Reminder</span><strong>{r.text}</strong><small>{r.status}</small></div></div>,
    })),
  ].sort((a, b) => a.at - b.at);
  function move(delta: number) { const value = new Date(`${day}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + delta); setDay(value.toISOString().slice(0, 10)); }
  const days = Array.from({ length: 7 }, (_, index) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 3 + index); return { date: d.toISOString().slice(0, 10), weekday: new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(d), number: d.getUTCDate() }; });

  return <div className={s.calendar}>
    <div className={s.toolbar}>
      <div className={s.dateControls}><button className={s.iconButton} aria-label="Previous day" onClick={() => move(-1)}><FiChevronLeft aria-hidden="true" /></button><input className={s.dateInput} type="date" aria-label="Calendar date" value={day} onChange={e => { if (e.target.value) setDay(e.target.value); }} /><button className={s.iconButton} aria-label="Next day" onClick={() => move(1)}><FiChevronRight aria-hidden="true" /></button><button className={s.textButton} onClick={() => setDay(localDay(new Date(), data.timezone))}>Today</button></div>
      <button className={s.primary} onClick={() => ask(`Help me schedule an event on ${day}.`)}><FiPlus aria-hidden="true" /> Plan with Tempo</button>
    </div>
    <div className={s.sheet}>
      <div className={s.weekStrip} role="group" aria-label="Choose a day">{days.map(d => <button key={d.date} aria-label={dateLabel(d.date)} aria-pressed={d.date === day} onClick={() => setDay(d.date)}><span>{d.weekday}</span><strong>{d.number}</strong></button>)}</div>
      <section className={s.agenda} aria-labelledby="calendar-agenda-heading">
        <header className={s.agendaHeader}><div><span className={s.kicker}>Day agenda</span><h2 id="calendar-agenda-heading">{dateLabel(day)}</h2><p>{data.timezone} · {preview ? "Sample calendar" : disconnected ? "Tasks and reminders" : "Google primary calendar"}</p></div>{!disconnected && <button className={s.iconButton} aria-label={preview ? "Refresh sample calendar" : "Refresh Google Calendar"} disabled={loading} onClick={() => setRefresh(n => n + 1)}><FiRefreshCw aria-hidden="true" /></button>}</header>
        {disconnected && <p className={s.notice}>Add calendar events alongside your tasks whenever you’re ready. <Link href="/extensions">Connect Google Calendar</Link></p>}
        {loading && <p className={s.notice} role="status">Refreshing your calendar…</p>}
        {error && <div role="alert" className={s.notice}>{requiresReconnect || data.calendar?.status === "requires_reauth" ? <>Your Google Calendar connection needs attention. Reconnect to see current events. <Link href="/extensions">Reconnect Google Calendar</Link></> : error}</div>}
        {truncated && <p className={s.notice}>Google returned more events than this view can display. Open Google Calendar for the full schedule.</p>}
        <div className={s.entries}>{agenda.map(entry => <div key={entry.id}>{entry.content}</div>)}</div>
        {!loading && !error && !agenda.length && <div className={s.empty}><FiCalendar aria-hidden="true" /><h3>A little room to breathe</h3><p>{disconnected ? "No tasks or reminders on this day." : "No calendar events, tasks, or reminders on this day."}</p></div>}
      </section>
      <footer className={s.connection}>
        <div className={s.connectionHeading}><FiCalendar aria-hidden="true" /><h3>Your Google Calendar</h3><Link className={s.textButton} href="/extensions">{data.calendar?.status === "requires_reauth" ? "Reconnect Google Calendar" : "Manage connection"} <FiArrowRight aria-hidden="true" /></Link></div>
        <p>{preview ? "Sample events for exploring the calendar. Your Google account is not connected to this preview." : data.calendar?.status === "active" ? "Connected to your Tempo account." : data.calendar?.status === "requires_reauth" ? "Reconnect Google Calendar to refresh your events." : "Connect your calendar to see events here."}</p>
        <small>{fetched && !error ? preview ? "Fictional events for this demo week." : `Events refreshed at ${time(fetched)}` : "Event access requires Google authorization."}</small>
        <details><summary>How calendar edits work</summary><p>Tempo asks you to confirm changes. Shared, recurring, and all-day event edits stay in Google Calendar.</p><a className={s.textButton} href="https://calendar.google.com" target="_blank" rel="noreferrer">Open Google Calendar <FiArrowRight aria-hidden="true" /></a></details>
      </footer>
    </div>
  </div>;
}
