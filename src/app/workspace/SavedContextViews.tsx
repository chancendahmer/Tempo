import { useState } from "react";
import { FiBookOpen, FiClock, FiEdit2, FiPlus, FiTrash2 } from "react-icons/fi";
import type { Workspace } from "./workspace-data";
import type { WorkspaceAction } from "@/server/db/repositories/workspace-repository";
import s from "./workspace.module.css";
import rb from "./rhythm-brain.module.css";

export function SavedContextViews({ section, data, saving, remove, ask, now = new Date() }: { section: "memories" | "reminders"; data: Workspace; now?: Date; saving: boolean; remove: (action: WorkspaceAction, title: string) => void; ask: (text: string) => void }) {
  const [query, setQuery] = useState("");
  const memories = section === "memories";
  const rows = memories ? (data.memories ?? []).map(item => ({ id: item.id, text: item.content, label: item.category.replaceAll("_", " "), status: "", overdue: false, disabled: false, action: { action: "forget_memory", id: item.id, expectedContent: item.content } as const })) : data.reminders.map(item => ({ id: item.id, text: item.text, label: `${new Intl.DateTimeFormat(undefined, { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(item.remindAt))} · ${data.timezone}`, status: item.status, overdue: item.status === "scheduled" && Date.parse(item.remindAt) < now.getTime(), disabled: item.status === "sending", action: { action: "remove_reminder", id: item.id } as const }));
  const shown = rows.filter(item => item.text.toLowerCase().includes(query.toLowerCase()));
  return <section className={memories ? rb.memories : rb.reminders} aria-label={memories ? "Saved facts and preferences" : "Saved reminders"}>
    <div className={rb.heading}><div><h2>{memories ? "Saved facts & preferences" : "Your reminders"}</h2><p>{memories ? "The context Tempo uses to understand you." : "Upcoming, overdue and delivered, in one place."}</p></div><button className={s.primary} disabled={saving} onClick={() => ask(memories ? "Remember this about me: " : "Remind me to ")}><FiPlus />{memories ? "Add a memory" : "New reminder"}</button></div>
    <p className={rb.infoCopy}>{memories ? "These are saved facts and preferences, not tasks. Ask Tempo to correct one, or remove it here. Removing a memory leaves your conversation history unchanged." : "Ask Tempo to set or change a reminder. Delivered reminders stay here until you remove them; messages already delivered remain in your conversation."}</p>
    <div className={rb.searchRow}><input aria-label={`Search ${section}`} value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${section}…`} /><small>{rows.length} saved</small></div>
    <div className={memories ? rb.memoryGrid : rb.reminderList}>{shown.map(item => <article className={memories ? rb.memoryCard : rb.reminderRow} key={item.id}>
      {memories ? <><div className={rb.cardTop}><span className={rb.typeChip}><FiBookOpen aria-hidden="true" />{item.label}</span><button className={s.iconButton} disabled={saving} onClick={() => remove(item.action, item.text)} aria-label={`Remove ${item.text}`}><FiTrash2 /></button></div><p className={rb.savedText}>{item.text}</p><button className={s.textButton} disabled={saving} onClick={() => ask(`Correct my saved memory “${item.text}” to: `)}><FiEdit2 />Correct with Tempo</button></> : <><FiClock aria-hidden="true" /><div className={rb.reminderBody}><span className={rb.status}>{item.overdue ? "Overdue · " : ""}{item.status}</span><p className={rb.savedText}>{item.text}</p><p className={rb.reminderDate}>{item.label}</p>{!item.disabled && <button className={s.textButton} disabled={saving} onClick={() => ask(`Change my reminder “${item.text}” (${item.label} · ${item.status}) to: `)}><FiEdit2 />Change with Tempo</button>}{item.disabled && <small>This reminder is being sent and cannot be recalled.</small>}</div><button className={s.iconButton} disabled={saving || item.disabled} onClick={() => remove(item.action, item.text)} aria-label={`Remove ${item.text}`}><FiTrash2 /></button></>}
    </article>)}</div>
    {!shown.length && <p className={s.muted}>{query ? "Nothing matches that search." : "Nothing saved here yet. Add something above or text Tempo."}</p>}
    {(memories ? data.memoriesTruncated : data.remindersTruncated) && <p>Showing 200 items. Ask Tempo to look up older items by description.</p>}
  </section>;
}
