import { useState } from "react";
import { FiBookOpen, FiClock, FiTrash2 } from "react-icons/fi";
import type { Workspace } from "./workspace-data";
import type { WorkspaceAction } from "@/server/db/repositories/workspace-repository";
import s from "./workspace.module.css";

export function SavedContextViews({ section, data, saving, remove }: { section: "memories" | "reminders"; data: Workspace; saving: boolean; remove: (action: WorkspaceAction, title: string) => void }) {
  const [query, setQuery] = useState("");
  const memories = section === "memories";
  const rows = memories ? (data.memories ?? []).map(item => ({ id: item.id, text: item.content, label: item.category.replaceAll("_", " "), disabled: false, action: { action: "forget_memory", id: item.id, expectedContent: item.content } as const })) : data.reminders.map(item => ({ id: item.id, text: item.text, label: `${new Intl.DateTimeFormat(undefined, { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(item.remindAt))} · ${item.status}`, disabled: item.status === "sending", action: { action: "remove_reminder", id: item.id } as const }));
  const shown = rows.filter(item => item.text.toLowerCase().includes(query.toLowerCase()));
  return <><div className={s.captureBox}>{memories ? <FiBookOpen /> : <FiClock />}<div><h2>{memories ? "A memory you can see and change." : "Every reminder, in one place."}</h2><p>{memories ? "Saved facts and preferences. Your thoughts and plans also have their own tabs." : "Past reminders stay here until you complete or remove them."}</p></div></div><div className={s.sectionHeading}><input aria-label={`Search ${section}`} value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${section}…`} /><small>{rows.length} saved</small></div><div className={s.twoColumns}>{shown.map(item => <article className={s.card} key={item.id}><div className={s.between}><span className={s.eyebrow}>{item.label}</span><button className={s.iconButton} disabled={saving || item.disabled} onClick={() => remove(item.action, item.text)} aria-label={`Remove ${item.text}`}><FiTrash2 /></button></div><p className={s.prewrap}>{item.text}</p>{item.disabled && <small>This reminder is being sent and cannot be recalled.</small>}</article>)}</div>{!shown.length && <p className={s.muted}>{query ? "Nothing matches that search." : "Nothing saved here yet. You can ask Tempo by text or in the assistant."}</p>}{(memories ? data.memoriesTruncated : data.remindersTruncated) && <p>Showing 200 items. Ask Tempo to look up older items by description.</p>}</>;
}
