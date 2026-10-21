"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { FiArrowRight, FiChevronDown, FiGrid, FiHome, FiLogOut, FiMenu, FiMoon, FiSearch, FiSettings, FiX } from "react-icons/fi";
import { navigationGroups, sections, type Section } from "./WorkspaceNavigation";
import type { Workspace } from "./workspace-data";
import type { SavedLifeItem } from "../../server/domain/life-items";
import s from "./home-header.module.css";

export function HomeHeader({ data, preview, saving, menuRef, openNavigation, go, editTask, openItem, editGoal, ask, signOut, hide }: {
  data: Workspace | null; preview: boolean; saving: boolean; menuRef: RefObject<HTMLButtonElement | null>;
  openNavigation: () => void; go: (section: Section) => void; editTask: (task: Workspace["tasks"][number]) => void;
  openItem: (item: SavedLifeItem) => void; editGoal: (goal: Workspace["goals"][number]) => void;
  ask: (text: string) => void; signOut: () => void; hide: () => void;
}) {
  const [open, setOpen] = useState<"spaces" | "profile" | "search" | null>(null);
  const [query, setQuery] = useState("");
  const header = useRef<HTMLElement>(null);
  const spacesButton = useRef<HTMLButtonElement>(null), profileButton = useRef<HTMLButtonElement>(null), searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setOpen(null); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null);
        (open === "spaces" ? spacesButton.current : open === "profile" ? profileButton.current : searchInput.current)?.focus();
      }
    };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  }, [open]);
  const navigate = (section: Section) => { setOpen(null); go(section); };
  const matches = query.trim().length < 2 || !data ? [] : [
    ...data.tasks.filter(task => !["completed", "abandoned"].includes(task.status)).map(task => ({ id: task.id, title: task.title, kind: "To-do", action: () => editTask(task) })),
    ...data.goals.filter(goal => goal.status === "active").map(goal => ({ id: goal.id, title: goal.title, kind: "Goal", action: () => editGoal(goal) })),
    ...data.items.filter(item => ["note", "meal", "recipe", "routine"].includes(item.data.kind)).map(item => ({ id: item.id, title: item.data.title, kind: item.data.kind === "note" ? "Thought" : item.data.kind === "meal" ? `${item.data.meal} · ${item.data.date}` : item.data.kind, action: () => openItem(item) })),
  ].filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 6);
  const initials = data?.profile.displayName?.split(" ").map(word => word[0]).slice(0, 2).join("") ?? "You";
  return <header ref={header} className={s.header} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(null); }}>
    <button ref={menuRef} className={s.menu} aria-label="Open navigation" aria-controls="workspace-navigation" onClick={openNavigation}><FiMenu /></button>
    <button className={s.brand} onClick={() => navigate("today")}>Tempo</button>
    <button className={s.homeButton} aria-current="page" onClick={() => navigate("today")}><FiHome />Home</button>
    <div className={s.spaces}><button ref={spacesButton} className={s.pill} aria-expanded={open === "spaces"} aria-controls="home-spaces" onClick={() => setOpen(open === "spaces" ? null : "spaces")}><FiGrid />Spaces <FiChevronDown /></button>
      {open === "spaces" && <nav id="home-spaces" className={s.spacesPanel} aria-label="Your spaces">{navigationGroups.map(group => <section key={group.id}><h2>{group.label}</h2>{group.sections.map(key => { const [, label, Icon, tone] = sections.find(([id]) => id === key)!; return <button key={key} onClick={() => navigate(key)}><Icon data-tone={tone} /><span>{label}</span><FiArrowRight /></button>; })}</section>)}</nav>}
    </div>
    <div className={s.search}><FiSearch /><input ref={searchInput} aria-label="Search your workspace" placeholder="Search tasks, notes, meals, or ask Tempo…" value={query} onFocus={() => setOpen("search")} onChange={event => { setQuery(event.target.value); setOpen("search"); }} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); header.current?.querySelector<HTMLButtonElement>("#home-search-results button")?.focus(); } if (event.key === "Enter") { event.preventDefault(); if (query.trim()) { setOpen(null); ask(query.trim()); } } }} disabled={!data} />
      {query && <button className={s.clear} aria-label="Clear search" onClick={() => { setQuery(""); searchInput.current?.focus(); }}><FiX /></button>}
      {open === "search" && query.trim().length >= 2 && <div className={s.results} id="home-search-results"><p>In your workspace</p>{matches.map(match => <button key={match.id} onClick={() => { setOpen(null); match.action(); }}><span>{match.title}<small>{match.kind}</small></span><FiArrowRight /></button>)}{!matches.length && <p>No matching saved items.</p>}<button onClick={() => { setOpen(null); ask(query.trim()); }}><span>Ask Tempo about “{query.trim()}”<small>Review your message before sending</small></span><FiArrowRight /></button></div>}
    </div>
    <div className={s.account}><button ref={profileButton} className={s.accountButton} aria-label="Your account" aria-expanded={open === "profile"} aria-controls="home-profile" onClick={() => setOpen(open === "profile" ? null : "profile")}><span>{initials}</span><FiChevronDown /></button>
      {open === "profile" && <div className={s.profilePanel} id="home-profile"><strong>{data?.profile.displayName ?? "Your account"}</strong><p>{preview ? "Fictional preview account" : data?.profile.phoneLast4 ? `Phone •••• ${data.profile.phoneLast4}` : "Tempo account"}</p><button onClick={() => navigate("settings")}><FiSettings />Settings</button><button onClick={() => { setOpen(null); hide(); }}><FiMoon />Hide private content</button>{preview ? <Link href="/workspace">Open my account <FiArrowRight /></Link> : <button disabled={saving} onClick={() => { setOpen(null); signOut(); }}><FiLogOut />Switch account / Log out</button>}</div>}
    </div>
  </header>;
}
