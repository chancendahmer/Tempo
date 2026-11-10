"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { FiArrowRight, FiChevronDown, FiLogOut, FiMoon, FiSettings, FiSun } from "react-icons/fi";
import type { Workspace } from "./workspace-data";
import s from "./home-header.module.css";

export function WorkspaceAccountMenu({ profile, preview, saving, hidden, settings, signOut, togglePrivacy, onOpen }: {
  profile: Pick<Workspace["profile"], "displayName" | "phoneLast4"> | null;
  preview: boolean;
  saving: boolean;
  hidden: boolean;
  settings: () => void;
  signOut: () => void;
  togglePrivacy: () => void;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const visibleProfile = hidden ? null : profile;
  const name = visibleProfile?.displayName?.trim();
  const initials = name?.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join("").toLocaleUpperCase() || "You";
  const closeAnd = (action: () => void) => { setOpen(false); action(); };
  return <div ref={root} className={s.account} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }}>
    <button type="button" ref={trigger} className={s.accountButton} aria-label={name ? `Your account, ${name}` : "Your account"} aria-expanded={open} aria-controls={panelId} onClick={() => {
      if (!open) onOpen?.();
      setOpen(!open);
    }}><span>{initials}</span><FiChevronDown aria-hidden="true" /></button>
    {open && <div className={s.profilePanel} id={panelId}>
      <strong>{name || "Your account"}</strong>
      <p>{preview ? "Fictional preview account" : visibleProfile?.phoneLast4 ? `Phone ending in ${visibleProfile.phoneLast4}` : "Tempo account"}</p>
      <button type="button" onClick={() => closeAnd(settings)}><FiSettings />Settings</button>
      <button type="button" onClick={() => {
        closeAnd(togglePrivacy);
        trigger.current?.focus({ preventScroll: true });
      }}>{hidden ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}{hidden ? "Show workspace" : "Hide private content"}</button>
      {preview ? <Link href="/workspace">Open my account <FiArrowRight /></Link> : <button type="button" disabled={saving} onClick={() => closeAnd(signOut)}><FiLogOut />Switch account / Log out</button>}
    </div>}
  </div>;
}
