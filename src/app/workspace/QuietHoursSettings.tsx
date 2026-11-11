"use client";

import { useId, useState } from "react";
import type { WorkspaceAction } from "../../server/db/repositories/workspace-repository";
import s from "./pilot-settings.module.css";

type Draft = { start: string; end: string; expectedStart: string | null; expectedEnd: string | null };
const validClock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function QuietHoursSettings({ start, end, timezone, preview, onSave }: {
  start: string | null; end: string | null; timezone: string; preview: boolean;
  onSave: (action: WorkspaceAction) => Promise<void>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const values = draft ?? { start: start?.slice(0, 5) ?? "", end: end?.slice(0, 5) ?? "", expectedStart: start, expectedEnd: end };
  const changedElsewhere = draft !== null && (draft.expectedStart?.slice(0, 5) !== start?.slice(0, 5) || draft.expectedEnd?.slice(0, 5) !== end?.slice(0, 5));
  function edit(field: "start" | "end", value: string) {
    setDraft({ ...values, [field]: value }); setMessage(""); setError("");
  }
  async function save() {
    if (saving || !draft) return;
    if (!validClock(draft.start) || !validClock(draft.end) || draft.start === draft.end) {
      setError("Choose a start and end time that are different."); return;
    }
    if (changedElsewhere) { setError("Quiet hours changed elsewhere. Load the saved times before trying again."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      await onSave({ action: "quiet_hours", ...draft });
      setDraft(null);
      setMessage(preview ? "Changed in preview only. No texts are sent." : "Quiet hours saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save quiet hours. Please try again."); }
    finally { setSaving(false); }
  }
  return <section className={s.timezone} aria-label="Quiet hours" aria-busy={saving}>
    <h3>Quiet hours</h3><p>Pause optional check-ins during this window in <strong>{timezone}</strong>. It can run overnight. Reminders you explicitly schedule are separate.</p>
    <label htmlFor={`${id}-start`}>Stay quiet from</label><input id={`${id}-start`} type="time" step={60} value={values.start} disabled={saving} onChange={e => edit("start", e.target.value)} />
    <label htmlFor={`${id}-end`}>Until</label><input id={`${id}-end`} type="time" step={60} value={values.end} disabled={saving} onChange={e => edit("end", e.target.value)} />
    {changedElsewhere && <p role="status">The saved times changed while you were editing. Your draft is still here.</p>}
    <div className={s.actions}>{draft && <button type="button" disabled={saving} onClick={() => { setDraft(null); setError(""); setMessage(""); }}>Load saved times</button>}<button type="button" disabled={saving || !draft || changedElsewhere} onClick={() => void save()}>{saving ? "Saving…" : "Save quiet hours"}</button></div>
    <small>This does not turn on check-ins or change SMS consent.</small>
    {message && <p role="status">{message}</p>}{error && <p className={s.error} role="alert">{error}</p>}
  </section>;
}
