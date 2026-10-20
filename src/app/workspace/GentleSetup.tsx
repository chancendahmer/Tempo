"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FiArrowRight, FiCheck, FiX } from "react-icons/fi";
import type { GentleSetup as Setup, GentleSetupAction } from "@/server/domain/gentle-setup";
import { WorkspaceAvatar } from "../components/WorkspaceAvatar";
import { loopDialogTab } from "./dialog-keyboard";
import s from "./gentle-setup.module.css";

const tones = [
  { value: "gentle", label: "A gentle nudge", detail: "Warm encouragement, with room to pause." },
  { value: "balanced", label: "A little of both", detail: "Encouragement and a clear next step." },
  { value: "direct", label: "Keep it direct", detail: "Short, clear suggestions to get going." },
] as const;

export function GentleSetup({ initial, onSave, onClose, progressOnly = false }: { initial: Setup; onSave: (action: GentleSetupAction) => Promise<void>; onClose: () => void; progressOnly?: boolean }) {
  const [step, setStep] = useState(progressOnly ? 2 : 0);
  const [name, setName] = useState(initial.displayName ?? "");
  const [tone, setTone] = useState(initial.coachingTone);
  const [showStreak, setShowStreak] = useState(initial.showStreak);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = dialog.current;
    modal?.showModal();
    return () => { modal?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);

  async function persist(action: GentleSetupAction) {
    if (saving) return;
    setSaving(true);
    setError("");
    try { await onSave(action); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your choices. Try again when you’re ready."); }
    finally { setSaving(false); }
  }

  function next(event: FormEvent) {
    event.preventDefault();
    if (step < 2) { setStep(value => value + 1); return; }
    void persist({ action: "save", ...(name.trim() !== (initial.displayName ?? "") ? { displayName: name.trim() } : {}), ...(tone !== initial.coachingTone ? { coachingTone: tone } : {}), ...(showStreak !== initial.showStreak ? { showStreak } : {}) });
  }

  const dismiss = () => { if (progressOnly) onClose(); else void persist({ action: "skip" }); };
  return <dialog ref={dialog} className={s.dialog} aria-labelledby="gentle-setup-title" aria-describedby="gentle-setup-description" onKeyDown={loopDialogTab} onCancel={event => { event.preventDefault(); if (!saving) dismiss(); }}>
    <form onSubmit={next}>
      <header className={s.header}><span>{progressOnly ? "YOUR PROGRESS" : `MAKE YOURSELF AT HOME · ${step + 1} OF 3`}</span><button type="button" className={s.close} aria-label="Close setup" disabled={saving} onClick={dismiss}><FiX /></button></header>
      <div className={s.mark} aria-hidden="true"><WorkspaceAvatar size={64} /></div>
      <h2 id="gentle-setup-title" ref={heading} tabIndex={-1}>{step === 0 ? "A little more you." : step === 1 ? "What kind of support feels good?" : "Progress, your way."}</h2>
      <p id="gentle-setup-description" className={s.description}>{step === 0 ? "Three small choices to make Tempo feel familiar. Everything here is optional, and you can change it later." : step === 1 ? "Choose the tone you’d like Tempo to use when you ask for help." : "A streak can be a small celebration. If numbers feel like pressure, keep your space free of them."}</p>
      <fieldset disabled={saving} className={s.fields}>
        {step === 0 ? <label className={s.name}><span>What should we call you? <small>Optional</small></span><input value={name} maxLength={80} autoComplete="given-name" placeholder="Your name, or leave it blank" onChange={event => setName(event.target.value)} /></label> : step === 1 ? <><legend className={s.srOnly}>Coaching tone</legend>{tones.map(option => <label className={s.choice} key={option.value}><input type="radio" name="coachingTone" value={option.value} checked={tone === option.value} onChange={() => setTone(option.value)} /><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}</> : <><legend className={s.srOnly}>Display activity streak</legend>{[{ value: true, label: "Show my activity streak", detail: "Days when I complete a task or routine step." }, { value: false, label: "Keep numbers out of it", detail: "Keep my daily view focused on what’s next." }].map(option => <label className={s.choice} key={String(option.value)}><input type="radio" name="showStreak" checked={showStreak === option.value} onChange={() => setShowStreak(option.value)} /><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}</>}
      </fieldset>
      <p className={s.note}>{step === 0 ? "Your texts and this workspace share the same Tempo account. " : ""}You’re in charge. This setup won’t turn on text check-ins.</p>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <footer className={s.actions}><button type="button" className={s.skip} disabled={saving} onClick={dismiss}>{progressOnly ? "Cancel" : "Skip for now"}</button><div>{step > 0 && !progressOnly && <button type="button" className={s.back} disabled={saving} onClick={() => setStep(value => value - 1)}>Back</button>}<button type="submit" className={s.next} disabled={saving}>{saving ? "Saving…" : step === 2 ? <>{progressOnly ? "Save display" : "Make it mine"} <FiCheck /></> : <>Continue <FiArrowRight /></>}</button></div></footer>
    </form>
  </dialog>;
}
