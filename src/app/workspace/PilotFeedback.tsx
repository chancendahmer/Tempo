"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { feedbackSections, type PilotFeedbackInput, type PilotFeedbackReceipt } from "../../server/domain/pilot-feedback";
import { loopDialogTab } from "./dialog-keyboard";
import s from "./pilot-settings.module.css";

const sectionLabels: Record<typeof feedbackSections[number], string> = { today: "Home", tasks: "To-do", calendar: "Calendar", goals: "Goals", reminders: "Reminders", routines: "Routines", wake: "Sunrise & sunset", meals: "Meal plan", recipes: "Recipes", groceries: "Groceries", nutrition: "Nutrition", movement: "Fitness", inbox: "Thoughts", memories: "Memories", assistant: "Ask Tempo", settings: "Settings", other: "Something else" };

export function PilotFeedback({ initialType, initialSection, preview = false, onClose }: { initialType: "problem" | "improvement"; initialSection: typeof feedbackSections[number]; preview?: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reference = useRef<HTMLInputElement>(null);
  const attempt = useRef<{ content: string; requestId: string } | null>(null);
  const [type, setType] = useState(initialType);
  const [section, setSection] = useState(initialSection);
  const [impact, setImpact] = useState<PilotFeedbackInput["impact"]>(initialType === "improvement" ? "idea" : "slowed");
  const [detail, setDetail] = useState("");
  const [followUpConsent, setFollowUpConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<PilotFeedbackReceipt | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = dialog.current;
    modal?.showModal(); heading.current?.focus();
    return () => { modal?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { if (receipt) heading.current?.focus({ preventScroll: true }); }, [receipt]);
  async function copyReference() {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.id);
      setCopyStatus("Reference copied.");
    } catch {
      reference.current?.focus({ preventScroll: true });
      reference.current?.select();
      setCopyStatus("Reference selected. Use your device’s Copy command, or press Ctrl+C or Command+C.");
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || preview) return;
    const content = JSON.stringify({ type, section, impact, detail: detail.trim(), followUpConsent });
    if (!attempt.current || attempt.current.content !== content) attempt.current = { content, requestId: crypto.randomUUID() };
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/account/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(content), requestId: attempt.current.requestId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Your report could not be confirmed. Retry with the same details.");
      if (!payload.receipt?.id || !payload.receipt.createdAt) throw new Error("Your receipt could not be confirmed. Retry with the same details.");
      setReceipt(payload.receipt);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your report could not be confirmed. Retry with the same details."); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} className={s.dialog} aria-busy={saving} aria-labelledby="pilot-feedback-title" aria-describedby="pilot-feedback-description" onKeyDown={loopDialogTab} onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <header><h2 ref={heading} tabIndex={-1} id="pilot-feedback-title">{receipt ? "Your report is saved." : type === "problem" ? "Report a problem" : "Suggest an improvement"}</h2><button type="button" className={s.close} aria-label="Close feedback" disabled={saving} onClick={onClose}>×</button></header>
    <p id="pilot-feedback-description">{receipt ? "Your report is saved to your account." : "No chats, tasks, phone number or screenshots are automatically attached. Please leave out passwords and other sensitive details."}</p>
    {receipt ? <div><p>To add more information later, open Report a problem in Settings and include this reference in your new report.</p><label htmlFor="pilot-feedback-reference">Report reference<input ref={reference} id="pilot-feedback-reference" className={s.receipt} readOnly value={receipt.id} onFocus={event => event.currentTarget.select()} /></label><button className={s.copy} type="button" onClick={() => void copyReference()}>Copy reference</button>{copyStatus && <p role="status" aria-live="polite">{copyStatus}</p>}<p>{followUpConsent ? "You allowed a follow-up about this report. No message has been sent by this form." : "You did not request a follow-up."}</p><button className={s.submit} type="button" onClick={onClose}>Done</button></div> : <form onSubmit={submit}>
      {preview && <p role="status">Preview only. Reports are not sent or saved here.</p>}
      <fieldset disabled={saving}>
        <label>Report type<select value={type} onChange={event => { const value = event.target.value as typeof type; setType(value); setImpact(value === "improvement" ? "idea" : "slowed"); }}><option value="problem">A problem</option><option value="improvement">An improvement</option></select></label>
        <label>Where did it happen?<select value={section} onChange={event => setSection(event.target.value as typeof section)}>{feedbackSections.map(value => <option key={value} value={value}>{sectionLabels[value]}</option>)}</select></label>
        <label>How does it affect you?<select value={impact} onChange={event => setImpact(event.target.value as typeof impact)}><option value="blocked">I cannot continue</option><option value="slowed">It makes things harder</option><option value="minor">A small issue</option><option value="idea">An idea that would help</option></select></label>
        <label>Anything else? <span>Optional · up to 1,000 characters</span><textarea rows={4} maxLength={1000} value={detail} onChange={event => setDetail(event.target.value)} /></label>
        <label className={s.checkbox}><input type="checkbox" checked={followUpConsent} onChange={event => setFollowUpConsent(event.target.checked)} /><span>Tempo’s pilot team may contact me about this report. Optional.</span></label>
      </fieldset>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button className={s.submit} type="submit" disabled={saving || preview}>{saving ? "Saving…" : "Send report"}</button></div>
    </form>}
  </dialog>;
}
