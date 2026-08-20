"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FiArrowRight, FiCalendar, FiCheck, FiCheckSquare, FiHeart, FiLock } from "react-icons/fi";
import { useAccountStatus } from "../components/account-state";

type ExtensionData = {
  calendar: { status: "active" | "requires_reauth" | "disconnected"; connectUrl: string; disconnectUrl: string | null };
};

export function ExtensionsClient() {
  const { account } = useAccountStatus(6_000);
  const [data, setData] = useState<ExtensionData | null>(null);

  useEffect(() => {
    if (!account?.phoneVerified) return;
    void fetch("/api/account/extensions", { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as ExtensionData : null)
      .then(setData)
      .catch(() => setData(null));
  }, [account?.phoneVerified, account?.calendarStatus]);

  if (account === undefined) return <div className="account-loading">Loading extensions…</div>;
  if (!account?.phoneVerified) {
    return (
      <section className="account-gate extensions-gate">
        <span aria-hidden="true"><FiLock /></span>
        <p className="eyebrow">Private by design</p>
        <h1>Log in to add extensions.</h1>
        <p>Extensions can access personal information, so Tempo only shows connection controls after your phone is verified.</p>
        <Link className="black-button" href="/#early-access">Connect your phone <FiArrowRight /></Link>
      </section>
    );
  }

  const calendarActive = data?.calendar.status === "active";
  return (
    <>
      <header className="extensions-heading">
        <p className="eyebrow">Extensions</p>
        <h1>Give Tempo better context.</h1>
        <p>Connect only what helps. Each extension is permissioned separately and can be removed later.</p>
      </header>
      <div className="extension-grid">
        <article className="extension-card extension-featured">
          <div className="extension-card-top">
            <span className="extension-icon google-calendar-icon"><FiCalendar /></span>
            <span className={`extension-status ${calendarActive ? "connected" : "available"}`}>
              {calendarActive ? <><FiCheck /> Connected</> : "Available"}
            </span>
          </div>
          <div>
            <p className="extension-provider">Google Workspace</p>
            <h2>Google Calendar</h2>
            <p>Lets Tempo read busy and open windows so it can suggest realistic moments without changing your events.</p>
          </div>
          <div className="extension-actions">
            {data ? (
              <a className="black-button" href={calendarActive ? data.calendar.connectUrl : data.calendar.connectUrl}>
                {calendarActive ? "Reconnect" : "Connect"} <FiArrowRight />
              </a>
            ) : <span className="extension-loading">Loading…</span>}
            {calendarActive && data?.calendar.disconnectUrl && <a className="disconnect-link" href={data.calendar.disconnectUrl}>Disconnect</a>}
          </div>
        </article>

        <article className="extension-card">
          <div className="extension-card-top">
            <span className="extension-icon health-icon"><FiHeart /></span>
            <span className="extension-status planned">Mobile app</span>
          </div>
          <div>
            <p className="extension-provider">Google Health</p>
            <h2>Health Connect</h2>
            <p>Future Android support for sleep, activity, and recovery context—with explicit health permissions on the device.</p>
          </div>
          <button className="extension-disabled" type="button" disabled>Coming with the mobile app</button>
        </article>

        <article className="extension-card">
          <div className="extension-card-top">
            <span className="extension-icon tasks-icon"><FiCheckSquare /></span>
            <span className="extension-status planned">Planned</span>
          </div>
          <div>
            <p className="extension-provider">Google Workspace</p>
            <h2>Google Tasks</h2>
            <p>Bring your task lists into Tempo so reminders and progress stay aligned across the tools you already use.</p>
          </div>
          <button className="extension-disabled" type="button" disabled>Coming next</button>
        </article>
      </div>
    </>
  );
}
