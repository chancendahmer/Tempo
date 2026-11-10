import { useState } from "react";
import { FiArrowRight, FiBookOpen, FiClock, FiEdit2, FiPlus, FiSearch, FiTrash2 } from "react-icons/fi";
import type { Workspace } from "./workspace-data";
import type { WorkspaceAction } from "@/server/db/repositories/workspace-repository";
import s from "./workspace.module.css";
import rb from "./rhythm-brain.module.css";

function reminderLabel(item: Workspace["reminders"][number], accountTimezone: string) {
  const timeZone = item.timezone ?? accountTimezone;
  const date = new Date(item.remindAt);
  const cadence = item.recurrence === "daily" ? "Daily" : item.recurrence === "weekdays" ? "Weekdays" : item.recurrence === "weekly" ? `Weekly on ${new Intl.DateTimeFormat(undefined, { timeZone, weekday: "long" }).format(date)}` : "One time";
  const timing = item.status === "scheduled" || item.status === "sending" ? "Next" : "Last scheduled";
  return `${cadence} · ${timing}: ${new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(date)} · ${timeZone}`;
}

export function SavedContextViews({ section, data, saving, remove, ask, now = new Date() }: { section: "memories" | "reminders"; data: Workspace; now?: Date; saving: boolean; remove: (action: WorkspaceAction, title: string) => void; ask: (text: string) => void }) {
  const [query, setQuery] = useState("");
  const memories = section === "memories";
  const rows = memories ? (data.memories ?? []).map(item => ({ id: item.id, text: item.content, label: item.category.replaceAll("_", " "), status: "", overdue: false, disabled: false, ended: false, action: { action: "forget_memory", id: item.id, expectedContent: item.content } as const })) : data.reminders.map(item => ({ id: item.id, text: item.text, label: reminderLabel(item, data.timezone), status: item.status, overdue: item.status === "scheduled" && Date.parse(item.remindAt) < now.getTime(), disabled: item.status === "sending", ended: item.status === "cancelled" || item.status === "completed", action: { action: "remove_reminder", id: item.id } as const }));
  const shown = rows.filter(item => `${item.text} ${item.label}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className={memories ? rb.memories : rb.reminders} aria-label={memories ? "Saved facts and preferences" : "Saved reminders"}>
    <div className={rb.heading}><div><h2>{memories ? "Saved facts & preferences" : "Your reminders"}</h2><p>{memories ? "The context Tempo uses to understand you." : "Your requested texts, including repeats and past reminders."}</p></div><button className={s.primary} disabled={saving} onClick={() => ask(memories ? "Remember this about me: " : "Remind me to ")}><FiPlus />{memories ? "Add a memory" : "New reminder"}</button></div>
    <details className={rb.infoDisclosure}><summary>{memories ? "How Tempo uses memories" : "About your reminders"}</summary><p className={rb.infoCopy}>{memories ? "These are saved facts and preferences, not tasks. Ask Tempo to correct one, or remove it here. Removing a memory leaves your conversation history unchanged." : "A task time does not request a text. Ask Tempo for a reminder separately. Completing a task keeps its reminder scheduled; cancel it here when you no longer want it. Past messages remain in your conversation."}</p></details>
    <div className={rb.searchRow}><label className={rb.searchField}><FiSearch aria-hidden="true" /><input type="search" aria-label={`Search ${section}`} value={query} onChange={event => setQuery(event.target.value)} placeholder={memories ? "Find a fact or preference…" : "Find a reminder…"} /></label><small className={rb.resultCount} role="status">{query.trim() ? `${shown.length} of ${rows.length} shown` : `${rows.length} saved`}</small></div>
    <div className={memories ? rb.memoryGrid : rb.reminderList}>{shown.map(item => <article className={memories ? rb.memoryCard : rb.reminderRow} key={item.id}>
      {memories ? <><div className={rb.cardTop}><span className={rb.typeChip}><FiBookOpen aria-hidden="true" />{item.label}</span><button className={s.iconButton} disabled={saving} onClick={() => remove(item.action, item.text)} aria-label={`Remove ${item.text}`}><FiTrash2 /></button></div><p className={rb.savedText}>{item.text}</p><button className={s.textButton} disabled={saving} onClick={() => ask(`Correct my saved memory “${item.text}” to: `)}><FiEdit2 aria-hidden="true" />Correct with Tempo<FiArrowRight aria-hidden="true" /></button></> : <><FiClock aria-hidden="true" /><div className={rb.reminderBody}><span className={rb.status}>{item.overdue ? "Overdue · " : ""}{item.status}</span><p className={rb.savedText}>{item.text}</p><p className={rb.reminderDate}>{item.label}</p>{!item.disabled && !item.ended && <button className={s.textButton} disabled={saving} onClick={() => ask(`Change my reminder “${item.text}” (${item.label} · ${item.status}) to: `)}><FiEdit2 />Change with Tempo</button>}{item.disabled && <small>This reminder is being sent and cannot be recalled.</small>}</div>{!item.ended && <button className={s.iconButton} disabled={saving || item.disabled} onClick={() => remove(item.action, item.text)} aria-label={`Cancel ${item.text}`}><FiTrash2 /></button>}</>}
    </article>)}</div>
    {!shown.length && <p className={s.muted}>{query ? "Nothing matches that search." : "Nothing saved here yet. Add something above or text Tempo."}</p>}
    {(memories ? data.memoriesTruncated : data.remindersTruncated) && <p>Showing 200 items. Ask Tempo to look up older items by description.</p>}
  </section>;
}
