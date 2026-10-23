"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { FiArrowRight, FiCheck, FiLogOut, FiMessageSquare, FiUser } from "react-icons/fi";
import { useRouter } from "next/navigation";
import { ACCOUNT_EVENT, PublicAccount, useAccountStatus } from "../components/account-state";

export function ProfileClient() {
  const { account, sessionKey, error, refresh } = useAccountStatus(6_000);
  const [recovery, setRecovery] = useState<"owner" | "auth" | null>(null);

  if (recovery === "auth") return <section className="account-gate" role="alert"><h1>Log in to your profile.</h1><p>Your session ended. Your changes were not saved. Log in again before editing your profile.</p><Link className="black-button" href="/login">Log in</Link></section>;
  if (recovery === "owner") return <section className="account-gate" role="alert"><h1>Check your signed-in account.</h1><p>Your changes were not saved. Reload your profile and review the account before entering your changes again.</p><button className="black-button" type="button" onClick={() => { setRecovery(null); void refresh(); }}>Reload profile</button></section>;
  if (error && !account?.phoneVerified || account?.phoneVerified && !account.cacheKey) return <section className="account-gate" role="alert">
    <h1>Your profile is temporarily unavailable.</h1><p>We couldn’t confirm your account. Please try again.</p>
    <button className="black-button" type="button" onClick={() => void refresh()}>Try again</button>
  </section>;
  if (account === undefined) return <div className="account-loading">Loading your profile…</div>;
  if (!account?.phoneVerified) {
    return (
      <section className="account-gate">
        <span aria-hidden="true"><FiMessageSquare /></span>
        <p className="eyebrow">Phone verification required</p>
        <h1>Finish the text setup first.</h1>
        <p>Tempo connects your web profile to the same phone number used in Messages.</p>
        <Link className="black-button" href="/#early-access">Finish setup <FiArrowRight /></Link>
      </section>
    );
  }

  return <ProfileEditor key={account.cacheKey} account={account} sessionKey={sessionKey} unavailable={!!error} retry={() => void refresh()} onSaved={() => void refresh()} invalidateOwner={reason => { setRecovery(reason); window.dispatchEvent(new Event(ACCOUNT_EVENT)); }} />;
}

function ProfileEditor({ account, sessionKey, unavailable, retry, onSaved, invalidateOwner }: { account: PublicAccount; sessionKey: string | null; unavailable: boolean; retry: () => void; onSaved: () => void; invalidateOwner: (reason: "owner" | "auth") => void }) {
  const [displayName, setDisplayName] = useState(account.displayName ?? "");
  const [instructions, setInstructions] = useState(account.profileInstructions ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unavailable) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, profileInstructions: instructions, expectedCacheKey: account.cacheKey }),
      });
      if (response.status === 401) { invalidateOwner("auth"); return; }
      if (response.status === 409) { invalidateOwner("owner"); return; }
      const payload = (await response.json()) as { error?: string };
      setMessage(response.ok ? "Saved. Tempo will use these instructions in future coaching." : payload.error ?? "Could not save your profile.");
      // Keep same-owner draft and success feedback mounted; a different owner still changes the editor key.
      if (response.ok) onSaved();
    } catch { setMessage("Could not confirm your save. Check your connection and try again."); }
    finally { setSaving(false); }
  }

  async function logout() {
    setSaving(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", headers: { "x-tempo-session": sessionKey ?? "" } });
      if (response.status === 401 || response.status === 409) { invalidateOwner(response.status === 401 ? "auth" : "owner"); return; }
      if (!response.ok) throw new Error("Sign-out failed");
      window.localStorage.removeItem("tempo-early-access-submitted");
      window.dispatchEvent(new Event(ACCOUNT_EVENT));
      router.push("/login");
      router.refresh();
    } catch { setMessage("Could not sign out. Please try again."); setSaving(false); }
  }

  return (
    <div className="profile-layout">
      <aside className="profile-summary">
        <span className="profile-large-avatar" aria-hidden="true"><FiUser /></span>
        <p className="eyebrow">Your Tempo</p>
        <h1>{account.displayName || "Make it personal"}</h1>
        <p>Phone ending in {account.phoneLast4}</p>
        <div className="profile-status"><FiCheck /> Phone connected</div>
        <Link href="/extensions">Manage extensions <FiArrowRight /></Link>
        <Link href="/board">Open room board <FiArrowRight /></Link>
        <Link href="/workspace">Open my workspace <FiArrowRight /></Link>
      </aside>
      <form className="profile-form" onSubmit={save}>
        {unavailable && <div role="status"><p>Showing your last known profile. It may be out of date. Your draft is still here; refresh your account before saving.</p><button className="text-action" type="button" onClick={retry}>Try again</button></div>}
        <div>
          <p className="eyebrow">Profile</p>
          <h2>Teach Tempo how to coach you.</h2>
          <p>These instructions are added to Tempo’s private context for your conversations and proactive nudges.</p>
        </div>
        <label>
          <span>What should Tempo call you?</span>
          <input value={displayName} onChange={(event) => { setDisplayName(event.target.value); setMessage(""); }} maxLength={80} required placeholder="Your name" />
        </label>
        <label>
          <span>Custom coaching instructions</span>
          <textarea
            value={instructions}
            onChange={(event) => { setInstructions(event.target.value); setMessage(""); }}
            maxLength={2_000}
            rows={8}
            placeholder="Example: Be direct, keep messages short, and offer me two choices when I’m stuck. Don’t text before 8am."
          />
          <small>{instructions.length}/2,000 characters</small>
        </label>
        <div className="profile-actions">
          <button className="black-button" type="submit" disabled={saving || unavailable}>{saving ? "Saving…" : "Save profile"}</button>
          <button className="text-action" type="button" disabled={saving || unavailable} onClick={logout}><FiLogOut /> Log out</button>
        </div>
        {message && <p className="profile-save-message" role="status">{message}</p>}
      </form>
    </div>
  );
}
