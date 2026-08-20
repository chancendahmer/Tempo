"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { FiArrowRight, FiCheck, FiLogOut, FiMessageSquare, FiUser } from "react-icons/fi";
import { useRouter } from "next/navigation";
import { ACCOUNT_EVENT, PublicAccount, useAccountStatus } from "../components/account-state";

export function ProfileClient() {
  const { account } = useAccountStatus(6_000);

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

  return <ProfileEditor account={account} />;
}

function ProfileEditor({ account }: { account: PublicAccount }) {
  const [displayName, setDisplayName] = useState(account.displayName ?? "");
  const [instructions, setInstructions] = useState(account.profileInstructions ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/account/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, profileInstructions: instructions }),
    });
    const payload = (await response.json()) as { error?: string };
    setSaving(false);
    setMessage(response.ok ? "Saved. Tempo will use these instructions in future coaching." : payload.error ?? "Could not save your profile.");
    if (response.ok) window.dispatchEvent(new Event(ACCOUNT_EVENT));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.localStorage.removeItem("tempo-early-access-submitted");
    window.dispatchEvent(new Event(ACCOUNT_EVENT));
    router.push("/");
    router.refresh();
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
      </aside>
      <form className="profile-form" onSubmit={save}>
        <div>
          <p className="eyebrow">Profile</p>
          <h2>Teach Tempo how to coach you.</h2>
          <p>These instructions are added to Tempo’s private context for your conversations and proactive nudges.</p>
        </div>
        <label>
          <span>What should Tempo call you?</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} required placeholder="Your name" />
        </label>
        <label>
          <span>Custom coaching instructions</span>
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={2_000}
            rows={8}
            placeholder="Example: Be direct, keep messages short, and offer me two choices when I’m stuck. Don’t text before 8am."
          />
          <small>{instructions.length}/2,000 characters</small>
        </label>
        <div className="profile-actions">
          <button className="black-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
          <button className="text-action" type="button" onClick={logout}><FiLogOut /> Log out</button>
        </div>
        {message && <p className="profile-save-message" role="status">{message}</p>}
      </form>
    </div>
  );
}
