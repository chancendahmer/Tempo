import { useState } from "react";
import { FiBookOpen, FiClock, FiEdit2, FiPlus, FiTrash2 } from "react-icons/fi";
import type { Workspace } from "./workspace-data";
import type { WorkspaceAction } from "@/server/db/repositories/workspace-repository";
import s from "./workspace.module.css";

export function SavedContextViews({ section, data, saving, remove, ask }: { section: "memories" | "reminders"; data: Workspace; saving: boolean; remove: (action: WorkspaceAction, title: string) => void; ask: (text: string) => void }) {
  const [query, setQuery] = useState("");
  const memories = section === "memories";
  const rows = memories ? (data.memories ?? []).map(item => ({ id: item.id, text: item.content, label: item.category.replaceAll("_", " "), disabled: false, action: { action: "forget_memory", id: item.id, expectedContent: item.content } as const })) : data.reminders.map(item => ({ id: item.id, text: item.text, label: `${new Intl.DateTimeFormat(undefined, { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(item.remindAt))} · ${item.status}`, disabled: item.status === "sending", action: { action: "remove_reminder", id: item.id } as const }));
  const shown = rows.filter(item => item.text.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className={s.sectionHeading}><h2>{memories ? "Saved facts & preferences" : "Your reminders"}</h2><button className={s.primary} disabled={saving} onClick={() => ask(memories ? "Remember this about me: " : "Remind me to ")}><FiPlus />{memories ? "Add a memory" : "New reminder"}</button></div>
    <div className={s.infoStrip}>{memories ? <FiBookOpen /> : <FiClock />}<span>{memories ? "Review what Tempo remembers. Ask Tempo to correct a fact, or remove it here." : "Ask Tempo to set or change a reminder. Delivered reminders stay here until you remove them."}</span></div>
    <div className={s.sectionHeading}><input aria-label={`Search ${section}`} value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${section}…`} /><small>{rows.length} saved</small></div>
    <div className={s.twoColumns}>{shown.map(item => <article className={s.card} key={item.id}>
      <div className={s.between}><span className={s.eyebrow}>{item.label}</span><button className={s.iconButton} disabled={saving || item.disabled} onClick={() => remove(item.action, item.text)} aria-label={`Remove ${item.text}`}><FiTrash2 /></button></div>
      <p className={s.prewrap}>{item.text}</p>
      {!item.disabled && <button className={s.textButton} disabled={saving} onClick={() => ask(memories ? `Correct my saved memory “${item.text}” to: ` : `Change my reminder “${item.text}” (${item.label}) to: `)}><FiEdit2 />Change with Tempo</button>}
      {item.disabled && <small>This reminder is being sent and cannot be recalled.</small>}
    </article>)}</div>
    {!shown.length && <p className={s.muted}>{query ? "Nothing matches that search." : "Nothing saved here yet. Add something above or text Tempo."}</p>}
    {(memories ? data.memoriesTruncated : data.remindersTruncated) && <p>Showing 200 items. Ask Tempo to look up older items by description.</p>}
  </>;
}
