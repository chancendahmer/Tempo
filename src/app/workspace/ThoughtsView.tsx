import { useState } from "react";
import { FiArrowRight, FiEdit2, FiInbox, FiPlus, FiSearch, FiTrash2, FiX } from "react-icons/fi";
import type { SavedLifeItem, ThoughtTask } from "@/server/domain/life-items";
import s from "./workspace.module.css";
import rb from "./rhythm-brain.module.css";
import n from "./thoughts.module.css";

type Props = {
  items: SavedLifeItem[];
  truncated?: boolean;
  saving: boolean;
  edit: (item?: SavedLifeItem) => void;
  remove: (item: SavedLifeItem) => void;
  toTask: (item: SavedLifeItem) => void;
  toGoal: (item: SavedLifeItem) => void;
  openTask?: (task: ThoughtTask) => void;
};

export function findThoughts(items: SavedLifeItem[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(({ data }) => data.kind === "note" && terms.every(term => `${data.title}\n${data.body}`.toLocaleLowerCase().includes(term)));
}

export function ThoughtsView({ items, truncated = false, saving, edit, remove, toTask, toGoal, openTask }: Props) {
  const [query, setQuery] = useState("");
  const notes = findThoughts(items, "");
  const visible = findThoughts(items, query);
  return <section className={rb.brain} aria-label="Saved thoughts">
    <div className={rb.capture}><FiInbox aria-hidden="true" /><div><h2>Out of your head. Saved here.</h2><p>Keep a loose end, an idea, or something for later.</p></div><button className={s.primary} disabled={saving} onClick={() => edit()}><FiPlus /> Capture a thought</button></div>
    {notes.length > 0 && <div className={rb.searchRow}>
      <label className={rb.searchField}><FiSearch aria-hidden="true" /><input type="search" aria-label="Search thoughts" placeholder="Find a thought…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {query && <button className={s.iconButton} aria-label="Clear thought search" onClick={() => setQuery("")}><FiX /></button>}
      <span className={rb.resultCount} role="status">{query.trim() ? `${visible.length} of ${notes.length}` : notes.length} {notes.length === 1 ? "thought" : "thoughts"}</span>
    </div>}
    {truncated && <p className={s.finePrint}>Searching the thoughts loaded here. Your older thoughts are still saved; ask Tempo to find one.</p>}
    <div className={rb.noteGrid}>{visible.map(item => item.data.kind === "note" && <article className={rb.note} key={item.id}>
      <div className={rb.cardTop}><h3>{item.data.title}</h3><div className={s.row}><button className={s.iconButton} disabled={saving} aria-label={`Edit ${item.data.title}`} onClick={() => edit(item)}><FiEdit2 /></button><button className={s.iconButton} disabled={saving} aria-label={`Remove ${item.data.title}`} onClick={() => remove(item)}><FiTrash2 /></button></div></div>
      {item.data.body && <p className={n.excerpt}>{item.data.body.length > 180 ? `${item.data.body.slice(0, 180).trimEnd()}…` : item.data.body}</p>}
      {item.data.body.length > 180 && <details className={n.fullNote}><summary aria-label={`Read full thought: ${item.data.title}`}>Read full thought</summary><p>{item.data.body}</p></details>}
      {item.data.taskId && <p className={s.finePrint}>{!item.linkedTask || item.linkedTask.status === "abandoned" ? "The task made from this thought was removed. Your thought stays saved. Add a separate new task for another step." : item.linkedTask.status === "completed" ? `Completed: ${item.linkedTask.title}` : `In To-do: ${item.linkedTask.title}`}</p>}
      <div className={rb.rowActions}>{item.data.taskId ? item.linkedTask && item.linkedTask.status !== "abandoned" && <button className={s.textButton} disabled={saving} onClick={() => openTask?.(item.linkedTask!)}>Open task <FiArrowRight /></button> : <button className={s.textButton} disabled={saving} onClick={() => toTask(item)}>Add to To-do <FiArrowRight /></button>}<button className={s.textButton} disabled={saving} onClick={() => toGoal(item)}>Make a goal <FiArrowRight /></button></div>
    </article>)}</div>
    {notes.length > 0 && visible.length === 0 && <div className={s.empty}><FiSearch /><h3>No matching thoughts</h3><p>Try a word from the title or the thought itself.</p><button className={s.secondary} onClick={() => setQuery("")}>Show all thoughts</button></div>}
    {notes.length === 0 && <div className={s.empty}><FiInbox /><h3>A place for the loose ends</h3><p>Nothing captured yet. Add a thought here or text Tempo.</p><button className={s.primary} disabled={saving} onClick={() => edit()}><FiPlus /> Capture a thought</button></div>}
    {notes.length > 0 && <p className={n.footnote}>A thought can become a next step. Your original note stays here.</p>}
  </section>;
}
