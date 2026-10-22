"use client";

import { useId, useState } from "react";
import { ianaTimezoneSchema } from "../../server/domain/timezone";
import type { GentleSetupAction } from "../../server/domain/gentle-setup";
import s from "./pilot-settings.module.css";

const commonZones = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "Pacific/Honolulu", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"];
export function timezoneLabel(zone: string) {
  if (zone === "UTC") return "UTC · Coordinated Universal Time";
  const parts = zone.split("/");
  return `${parts.at(-1)?.replaceAll("_", " ")} · ${parts[0] === "America" ? "Americas" : parts[0]}`;
}

export function TimezoneSettings({ timezone, timezoneConfirmedAt, preview = false, onSave }: { timezone: string; timezoneConfirmedAt?: string; preview?: boolean; onSave: (action: GentleSetupAction) => Promise<void> }) {
  const inputId = useId();
  const [value, setValue] = useState(timezone);
  const [custom, setCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const parsedValue = ianaTimezoneSchema.safeParse(value);
  const unchanged = parsedValue.success && parsedValue.data === timezone;
  const confirmed = Boolean(timezoneConfirmedAt);
  const options = [...new Set([...commonZones, timezone, ...(parsedValue.success ? [value] : [])])];
  async function confirm() {
    if (saving || (confirmed && unchanged)) return;
    setError(""); setMessage("");
    const parsed = ianaTimezoneSchema.safeParse(value);
    if (!parsed.success) { setError("Choose a named time zone such as America/New_York, Europe/London or UTC."); return; }
    setSaving(true);
    try {
      await onSave({ action: "timezone", timezone: parsed.data });
      setValue(parsed.data);
      setMessage(preview ? "Changed in preview only. It resets on reload." : `Time zone confirmed: ${timezoneLabel(parsed.data)}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not confirm your time zone. Try again."); }
    finally { setSaving(false); }
  }
  return <section className={s.timezone} aria-busy={saving} aria-label="Time zone confirmation">
    <h3>Your time zone</h3><p>Plans and new reminder times use <strong>{timezoneLabel(timezone)}</strong>.</p>
    <p role="status">{confirmed ? `${preview ? "Confirmed in preview" : "Confirmed"}: ${timezoneLabel(timezone)}.` : "Choose your city and confirm its time zone."}{!unchanged ? " You have an unsaved change." : ""}</p>
    <label htmlFor={inputId}>City or time zone</label><select id={inputId} value={custom ? "custom" : value} disabled={saving} onChange={event => { setMessage(""); setError(""); if (event.target.value === "custom") setCustom(true); else { setCustom(false); setValue(event.target.value); } }}>{options.map(zone => <option key={zone} value={zone}>{timezoneLabel(zone)}</option>)}<option value="custom">Another city or time zone…</option></select>
    {custom && <><label htmlFor={`${inputId}-custom`}>Named time zone</label><input id={`${inputId}-custom`} value={value} maxLength={100} disabled={saving} placeholder="For example, Europe/Rome" onChange={event => { setValue(event.target.value); setMessage(""); setError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void confirm(); } }} /><small>Use a city zone such as Europe/Rome or America/Vancouver.</small></>}
    <div className={s.actions}><button type="button" disabled={saving} onClick={() => {
      try { const suggestion = Intl.DateTimeFormat().resolvedOptions().timeZone; setValue(suggestion); setCustom(false); setError(""); setMessage(`Suggested ${timezoneLabel(suggestion)}.${confirmed && suggestion === timezone ? " Already confirmed." : " Confirm to save it."}`); }
      catch { setError("Your browser could not suggest a time zone. Enter one above."); }
    }}>Use this device’s zone</button><button type="button" disabled={saving || (confirmed && unchanged)} onClick={() => void confirm()}>{saving ? "Saving…" : confirmed && unchanged ? "Time zone confirmed" : "Confirm time zone"}</button></div>
    <small>Existing reminders keep their scheduled moment. This does not turn on text check-ins.</small>
    {message && <p role="status">{message}</p>}{error && <p className={s.error} role="alert">{error}</p>}
  </section>;
}
