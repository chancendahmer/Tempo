"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./board.module.css";

type Board = {
  timezone: string; generatedAt: string;
  tasks: { id: string; title: string; status: string; dueAt: string | null; estimatedMinutes: number | null }[];
  reminders: { id: string; text: string; remindAt: string; status: string }[];
  calendar: { status: string; lastSyncedAt: string | null } | null;
  busy: { id: string; startsAt: string; endsAt: string }[];
};

export function BoardClient() {
  const [board, setBoard] = useState<Board | null>(null);
  const [message, setMessage] = useState("Loading your day…");
  const [now, setNow] = useState<Date | null>(null);
  const [hidden, setHidden] = useState(false);
  const [simple, setSimple] = useState(false);
  const [speechMessage, setSpeechMessage] = useState("");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/account/board", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? "Log in to open your board." : "Connection unavailable. Retrying shortly.");
        const payload = await response.json() as Board;
        if (!stopped) { setBoard(payload); setMessage(""); }
      } catch (error) {
        // Clear private/stale data on logout, expiry, or network failure.
        if (!stopped) {
          window.speechSynthesis?.cancel();
          setBoard(null);
          setMessage(error instanceof Error ? error.message : "Could not refresh your board.");
        }
      } finally { if (!stopped) timer = setTimeout(refresh, 30_000); }
    }
    void refresh();
    const clock = setInterval(() => setNow(new Date()), 1_000);
    return () => { stopped = true; controller.abort(); clearTimeout(timer); clearInterval(clock); window.speechSynthesis?.cancel(); };
  }, []);

  function speak() {
    if (!board || !now) return;
    if (!("speechSynthesis" in window)) { setSpeechMessage("Spoken briefings are unavailable in this browser."); return; }
    window.speechSynthesis.cancel();
    const next = board.tasks[0];
    const upcoming = board.reminders.filter(item => new Date(item.remindAt) > now).slice(0, 3);
    const text = [`Here is your day.`, next ? `Your next task is ${next.title}.` : "Your task list is clear.",
      ...upcoming.map(item => `${item.text}, ${formatTime(item.remindAt)}.`)].join(" ");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.onerror = () => setSpeechMessage("Could not read aloud. Your written briefing is still available.");
    window.speechSynthesis.speak(utterance);
    setSpeechMessage("Reading your briefing. Use Stop audio to stop.");
  }

  function formatTime(value: string) {
    return new Intl.DateTimeFormat(undefined, { timeZone: board?.timezone ?? "UTC", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  }

  return <main className={styles.board}>
    <header><strong>tempo / room board</strong><nav className={styles.controls} aria-label="Board controls">
      <Link href="/profile">Profile</Link><Link href="/extensions">Connections</Link>
      <button onClick={() => { window.speechSynthesis?.cancel(); setHidden(!hidden); }}>{hidden ? "Show board" : "Hide board"}</button>
      <button onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { setSpeechMessage("Use your browser’s full-screen control on this device."); } }}>Full screen</button>
    </nav></header>
    {hidden ? <h1>Your board is hidden.</h1> : <>
      <p className={styles.clock}>{now && board ? new Intl.DateTimeFormat(undefined, { timeZone: board.timezone, hour: "numeric", minute: "2-digit" }).format(now) : ""}</p>
      <h1>One thing at a time.</h1>
      {message && <p className={styles.notice} role="status">{message} <Link href="/login">Log in</Link></p>}
      {board && <>
        <p>Shared with your Tempo text assistant · {board.timezone}</p>
        <div className={styles.controls}>
          <button onClick={speak}>Read my briefing aloud</button>
          <button onClick={() => { window.speechSynthesis?.cancel(); setSpeechMessage("Audio stopped."); }}>Stop audio</button>
          <button aria-pressed={simple} onClick={() => setSimple(!simple)}>{simple ? "Show the day" : "Focus on one thing"}</button>
        </div>
        <div className={styles.grid}>
          <section className={`${styles.card} ${styles.focus}`}><p className={styles.label}>→ Next small step</p>
            <h2>{board.tasks[0]?.title ?? "A little breathing room."}</h2>
            <p>{board.tasks[0] ? "Start with just the first small part. You can change the plan." : "Text Tempo to add a task or plan your morning."}</p>
            {board.tasks[0]?.estimatedMinutes && <small>Estimated time: {board.tasks[0].estimatedMinutes} minutes</small>}
            {board.tasks[0]?.dueAt && <small>Due {formatTime(board.tasks[0].dueAt)}</small>}
          </section>
          {!simple && <>
            <section className={styles.card}><p className={styles.label}>◷ Reminders</p><h2>Coming up</h2><small>Next 24 hours and the past hour</small>
              <ul>{board.reminders.map(item => <li key={item.id}>{item.text}<small>{formatTime(item.remindAt)} · {item.status === "sent" ? "SMS sent" : item.status}</small></li>)}</ul>
              {!board.reminders.length && <p>No reminders in this window.</p>}
            </section>
            <section className={styles.card}><p className={styles.label}>✓ Your open tasks</p><h2>Room for later</h2>
              <ul>{board.tasks.slice(1).map(item => <li key={item.id}>{item.title}<small>{item.dueAt ? `Due ${formatTime(item.dueAt)}` : "No due date"}</small></li>)}</ul>
              {board.tasks.length < 2 && <p>No other open tasks.</p>}<small>Showing up to 20 open tasks. Text Tempo to add, change, or complete one.</small>
            </section>
            <section className={styles.card}><p className={styles.label}>▦ Google Calendar</p><h2>Time already spoken for</h2>
              <p>{board.calendar?.status === "active" ? "Saved busy periods · next 24 hours" : "Connect or reconnect Google Calendar in Connections."}</p>
              {board.calendar?.status === "active" && <><small>{board.calendar.lastSyncedAt ? `Calendar last synced ${formatTime(board.calendar.lastSyncedAt)}` : "Calendar has not synced yet."}</small>
                <ul>{board.busy.map(item => <li key={item.id}>Busy<small>{formatTime(item.startsAt)} – {formatTime(item.endsAt)}</small></li>)}</ul>
                {!board.busy.length && <p>No saved busy periods in this window. This does not guarantee availability.</p>}</>}
            </section>
          </>}
        </div>
        <p>Try texting: “Remind me every day at 8 am to eat breakfast.”</p>
        <small>Board refreshed {formatTime(board.generatedAt)}. Audio starts only when you press Read my briefing aloud.</small>
      </>}
    </>}
    {speechMessage && <p role="status">{speechMessage}</p>}
  </main>;
}
