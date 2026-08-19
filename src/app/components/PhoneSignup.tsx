"use client";

import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import { FiCheck, FiMessageCircle, FiUserPlus } from "react-icons/fi";

const STORAGE_KEY = "tempo-early-access-submitted";
const STORAGE_EVENT = "tempo-signup-change";

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
  vcfUrl: string;
};

function parseStoredAssignment(value: string | null): OnboardingAssignment | null {
  if (!value || value === "true") return null;
  try {
    const parsed = JSON.parse(value) as Partial<OnboardingAssignment>;
    return parsed.phoneNumber && parsed.messageHref && parsed.vcfUrl
      ? parsed as OnboardingAssignment
      : null;
  } catch {
    return null;
  }
}

const countries = [
  {
    code: "US", flag: "us", callingCode: "+1", nationalLength: 10, areaMinLength: 3, areaMaxLength: 3,
    areas: [
      { code: "202", label: "Washington, DC", placeholder: "555-0198" }, { code: "212", label: "New York, NY", placeholder: "555-0198" },
      { code: "305", label: "Miami, FL", placeholder: "555-0198" }, { code: "312", label: "Chicago, IL", placeholder: "555-0198" },
      { code: "415", label: "San Francisco, CA", placeholder: "555-0198" }, { code: "617", label: "Boston, MA", placeholder: "555-0198" },
      { code: "702", label: "Las Vegas, NV", placeholder: "555-0198" },
    ],
  },
  {
    code: "CA", flag: "ca", callingCode: "+1", nationalLength: 10, areaMinLength: 3, areaMaxLength: 3,
    areas: [
      { code: "416", label: "Toronto, ON", placeholder: "555-0142" }, { code: "514", label: "Montréal, QC", placeholder: "555-0142" },
      { code: "604", label: "Vancouver, BC", placeholder: "555-0142" },
    ],
  },
  {
    code: "GB", flag: "gb", callingCode: "+44", nationalLength: 10, areaMinLength: 2, areaMaxLength: 4,
    areas: [
      { code: "20", label: "London", placeholder: "7946 0958" }, { code: "121", label: "Birmingham", placeholder: "555 0142" },
      { code: "161", label: "Manchester", placeholder: "555 0142" },
    ],
  },
  {
    code: "AU", flag: "au", callingCode: "+61", nationalLength: 9, areaMinLength: 1, areaMaxLength: 1,
    areas: [
      { code: "2", label: "Sydney / Canberra", placeholder: "5550 1234" }, { code: "3", label: "Melbourne / Tasmania", placeholder: "5550 1234" },
      { code: "7", label: "Brisbane / Queensland", placeholder: "5550 1234" },
    ],
  },
];

export function PhoneSignup() {
  const [countryCode, setCountryCode] = useState("US");
  const [areaCode, setAreaCode] = useState("202");
  const [phone, setPhone] = useState("");
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submittedState = useSyncExternalStore(subscribeToSubmittedState, getSubmittedState, () => null);
  const submitted = submittedState !== null;
  const onboarding = parseStoredAssignment(submittedState);
  const country = useMemo(
    () => countries.find((item) => item.code === countryCode) ?? countries[0],
    [countryCode],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (areaCode.length < country.areaMinLength || areaCode.length > country.areaMaxLength) {
      setError(`Enter a valid ${country.areaMinLength === country.areaMaxLength ? country.areaMinLength : `${country.areaMinLength}–${country.areaMaxLength}`}-digit area code.`);
      return;
    }
    const subscriberLength = country.nationalLength - areaCode.length;
    if (digits.length !== subscriberLength) {
      setError(`Enter a ${subscriberLength}-digit phone number after the area code.`);
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
          callingCode: country.callingCode,
          areaCode,
          subscriberNumber: phone,
          consent: true,
        }),
      });
      const payload = (await response.json()) as { error?: string; onboarding?: OnboardingAssignment };
      if (!response.ok) throw new Error(payload.error ?? "Could not complete signup.");

      window.localStorage.setItem(STORAGE_KEY, payload.onboarding ? JSON.stringify(payload.onboarding) : "true");
      window.dispatchEvent(new Event(STORAGE_EVENT));
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Could not complete signup.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="signup-success" role="status">
        <div className="signup-success-heading">
          <span className="success-check" aria-hidden="true"><FiCheck /></span>
          <span>{onboarding ? "One last step: start the conversation." : "You’re in. Tempo will text you to start setup."}</span>
        </div>
        {onboarding && (
          <div className="signup-success-actions">
            <a className="black-button" href={onboarding.messageHref}>
              <FiMessageCircle aria-hidden="true" /> Text START to Tempo
            </a>
            <a className="signup-contact-link" href={onboarding.vcfUrl}>
              <FiUserPlus aria-hidden="true" /> Save Tempo contact
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form className="signup-form" onSubmit={submit} noValidate>
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
              setAreaCode(nextCountry.areas[0].code);
              setPhone("");
              setError("");
            }}
            aria-label="Country calling code"
          >
            {countries.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code}
              </option>
            ))}
          </select>
        </div>
        <span className="calling-code" aria-hidden="true">
          {country.callingCode}
        </span>
        <div className="area-code-control">
          <label className="sr-only" htmlFor="area-code">Area code</label>
          <input
            className="area-code-input"
            id="area-code"
            inputMode="numeric"
            autoComplete="tel-area-code"
            list={`area-code-suggestions-${country.code}`}
            value={areaCode}
            onChange={(event) => {
              setAreaCode(event.target.value.replace(/\D/g, "").slice(0, country.areaMaxLength));
              setError("");
            }}
            aria-label="Area code"
          />
          <datalist id={`area-code-suggestions-${country.code}`}>
            {country.areas.map((area) => (
              <option key={area.code} value={area.code}>{area.label}</option>
            ))}
          </datalist>
        </div>
        <label className="sr-only" htmlFor="phone">
          Phone number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={country.areas.find((area) => area.code === areaCode)?.placeholder ?? "Phone number"}
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
