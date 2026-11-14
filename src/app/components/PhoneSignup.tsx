"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { FiArrowRight, FiCheck, FiMessageCircle, FiUserPlus } from "react-icons/fi";
import { signupPhoneToE164 } from "../../server/domain/phone";
import { ACCOUNT_EVENT, useAccountStatus } from "./account-state";
import { publishAccountChange } from "./account-change";

const STORAGE_KEY = "tempo-early-access-submitted";
const STORAGE_EVENT = "tempo-signup-change";
class SignInChangedError extends Error {}

export async function resetPhoneSignup(sessionKey: string | null) {
  // Revoke the pending browser claim before forgetting it or accepting another number.
  const response = await fetch("/api/auth/logout", { method: "POST", headers: { "x-tempo-session": sessionKey ?? "" } });
  if (response.status === 409 || response.status === 401) {
    window.dispatchEvent(new Event(ACCOUNT_EVENT));
    throw new SignInChangedError("Your sign-in changed. Reload this page and check the current account before resetting.");
  }
  if (!response.ok) throw new Error("We couldn’t reset this sign-in attempt. Please try again.");
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } finally {
    publishAccountChange();
  }
}

function subscribeToSubmittedState(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}

function getSubmittedState() {
  return window.localStorage.getItem(STORAGE_KEY);
}

type OnboardingAssignment = {
  phoneNumber: string;
  messageHref: string;
  vcfUrl?: string;
  verificationSent?: boolean;
  alreadyVerified?: boolean;
  signInLinkQueued?: boolean;
};

function parseStoredAssignment(value: string | null): OnboardingAssignment | null {
  if (!value || value === "true") return null;
  try {
    const parsed = JSON.parse(value) as Partial<OnboardingAssignment>;
    return parsed.phoneNumber && parsed.messageHref
      ? parsed as OnboardingAssignment
      : null;
  } catch {
    return null;
  }
}

const countries = [
  { code: "US", flag: "us", callingCode: "+1", name: "United States" },
  { code: "CA", flag: "ca", callingCode: "+1", name: "Canada" },
  { code: "GB", flag: "gb", callingCode: "+44", name: "United Kingdom" },
  { code: "AU", flag: "au", callingCode: "+61", name: "Australia" },
];

export function PhoneSignup() {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState("US");
  const [phone, setPhone] = useState("");
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [abandoned, setAbandoned] = useState(false);
  const abandoning = useRef(false);
  const resetSession = useRef<string | null | undefined>(undefined);
  const phoneInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const submittedState = useSyncExternalStore(subscribeToSubmittedState, getSubmittedState, () => null);
  const submitted = submittedState !== null;
  const { account, sessionKey, error: accountError, suspend } = useAccountStatus(submitted ? 4_000 : 0, !abandoned);
  const onboarding = parseStoredAssignment(submittedState);
  useEffect(() => {
    if (submitted && !abandoning.current && account?.phoneVerified) router.replace("/workspace");
  }, [submitted, abandoned, account?.phoneVerified, router]);
  useEffect(() => {
    if (abandoned && !submitted && !resetting) phoneInput.current?.focus();
  }, [abandoned, submitted, resetting]);
  const country = useMemo(
    () => countries.find((item) => item.code === countryCode) ?? countries[0],
    [countryCode],
  );

  async function restart(destination: "phone" | "login") {
    if (resetting) return;
    if (resetSession.current === undefined && (account === undefined || accountError || (account && !sessionKey))) { setError("Wait for your current sign-in to load, then try again."); return; }
    abandoning.current = true;
    setAbandoned(true);
    setResetting(true);
    setError("");
    // Retain the observed proof through a failed reset; never obtain a new
    // session proof automatically while retrying the abandoned sign-in intent.
    if (resetSession.current === undefined) resetSession.current = sessionKey;
    suspend();
    try {
      await resetPhoneSignup(resetSession.current);
      resetSession.current = undefined;
      setPhone("");
      setConsented(false);
      if (destination === "login") router.push("/login");
    } catch (cause) {
      setError(cause instanceof SignInChangedError ? cause.message : "We couldn’t reset this sign-in attempt. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || resetting) return;
    try {
      signupPhoneToE164({ countryCode: country.code, phoneNumber: phone });
    } catch {
      setError("Enter your full phone number, including the area code.");
      phoneInput.current?.focus();
      return;
    }
    if (!consented) {
      setError("Confirm that Tempo may text you before continuing.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: country.code,
          phoneNumber: phone,
          consent: true,
        }),
      });
      const payload = (await response.json()) as { error?: string; onboarding?: OnboardingAssignment };
      if (!response.ok) throw new Error(payload.error ?? "Could not complete signup.");

      publishAccountChange();
      window.localStorage.setItem(STORAGE_KEY, payload.onboarding ? JSON.stringify(payload.onboarding) : "true");
      resetSession.current = undefined;
      abandoning.current = false;
      setAbandoned(false);
      window.dispatchEvent(new Event(STORAGE_EVENT));
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Could not complete signup.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!abandoned && account?.phoneVerified) {
    return (
      <div className="signup-success signup-account-ready" role="status">
        <div className="signup-success-heading">
          <span className="success-check" aria-hidden="true"><FiCheck /></span>
          <span>{account.onboardingState === "complete" ? "Your Tempo account is ready." : "Your phone is connected to Tempo."}</span>
        </div>
        <div className="signup-success-actions account-ready-actions">
          <Link className="black-button" href="/workspace">
            Open my dashboard <FiArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="signup-success" role="status">
        <div className="signup-success-heading">
          <span className="success-check" aria-hidden="true"><FiCheck /></span>
          <span>
            {onboarding?.signInLinkQueued
              ? "Check your texts for your sign-in link."
              : onboarding?.verificationSent
              ? "Check your messages to finish setup."
              : onboarding?.alreadyVerified
                ? "Welcome back. Text START to finish signing in."
                : onboarding
                  ? "One last step: start the conversation."
                  : "Finish phone setup to open your dashboard."}
          </span>
        </div>
        <div className="signup-success-actions">
          {onboarding && <>
            {onboarding.signInLinkQueued ? (
              <p className="signup-verification-note">
                Your sign-in text is queued. Open its link and confirm within 15 minutes. This page will take you to your dashboard automatically. If it expires, return to sign in to request another link.
              </p>
            ) : onboarding.alreadyVerified && (
              <p className="signup-verification-note">
                Your number is already verified. Send START to Tempo within 30 minutes, then return to this browser to open your account. You don’t need to create a new account.
              </p>
            )}
            {onboarding.verificationSent && (
              <p className="signup-verification-note">
                Reply to Sendblue’s one-time verification message. Tempo will then send its welcome and contact card.
              </p>
            )}
            {!onboarding.signInLinkQueued && <a className="black-button" href={onboarding.messageHref}>
              <FiMessageCircle aria-hidden="true" />
              {onboarding.verificationSent ? "No message? Text START" : "Text START to Tempo"}
            </a>}
            {onboarding.vcfUrl && (
              <a className="signup-contact-link" href={onboarding.vcfUrl}>
                <FiUserPlus aria-hidden="true" /> Save Tempo contact
              </a>
            )}
          </>}
          <button type="button" className="signup-contact-link" disabled={resetting} onClick={() => void restart("phone")}>
            {resetting ? "Resetting sign-in…" : "Use a different number"}
          </button>
          <button type="button" className="signup-contact-link" disabled={resetting} onClick={() => void restart("login")}>
            Back to sign in
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <form className="signup-form" onSubmit={submit} noValidate>
      <p className="signup-fine-print">Private pilot · new accounts need an invitation from the Tempo team. Use your invited number, or your existing account’s number to sign in.</p>
      <div className="signup-control">
        <div className="country-control">
          <span className={`fi fi-${country.flag}`} aria-hidden="true" />
          <label className="sr-only" htmlFor="country">
            Country
          </label>
          <select
            id="country"
            value={countryCode}
            onChange={(event) => {
              const nextCountry = countries.find((item) => item.code === event.target.value) ?? countries[0];
              setCountryCode(nextCountry.code);
              setError("");
            }}
            aria-label="Country calling code"
          >
            {countries.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name} ({item.callingCode})
              </option>
            ))}
          </select>
        </div>
        <span className="calling-code" aria-hidden="true">
          {country.callingCode}
        </span>
        <label className="sr-only" htmlFor="phone">
          Phone number
        </label>
        <input
          id="phone"
          name="phone"
          ref={phoneInput}
          className="phone-number-input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={40}
          placeholder="Phone number"
          value={phone}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "phone-error" : "signup-note"}
          onChange={(event) => {
            setPhone(event.target.value);
            if (error) setError("");
          }}
        />
        <button className="black-button signup-button" type="submit" disabled={submitting}>
          {submitting ? "Joining…" : "Get started"}
        </button>
      </div>
      <label className="sms-consent">
        <input
          type="checkbox"
          checked={consented}
          onChange={(event) => {
            setConsented(event.target.checked);
            if (error) setError("");
          }}
        />
        <span>
          I agree to receive recurring automated coaching texts from Tempo. Frequency varies. Msg &amp; data rates may apply.
          Reply STOP to opt out or HELP for help. Consent isn’t a condition of purchase. See the <a href="/terms">Terms</a> and{" "}
          <a href="/privacy">Privacy Policy</a>.
        </span>
      </label>
      {error && (
        <p className="form-error" id="phone-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
