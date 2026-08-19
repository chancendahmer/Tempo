import type { Metadata } from "next";
import { LegalPage } from "../components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Tempo",
  description: "How Tempo collects, uses, and protects information for its SMS coaching service.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy policy"
      title="Your context should work for you—not become a profile sold about you."
      summary="This policy explains the information Tempo uses to provide its SMS coaching service and the controls available to you."
    >
      <section>
        <h2>Information we collect</h2>
        <p>We collect the phone number and consent evidence you provide, your SMS messages with Tempo, tasks and preferences you ask Tempo to remember, and service records such as message delivery and intervention outcomes.</p>
        <p>If you connect Google Calendar, Tempo requests read-only calendar access. Tempo stores encrypted authorization credentials and a short-lived cache of busy time windows. The V1 service does not store event titles or descriptions in its calendar cache.</p>
      </section>
      <section>
        <h2>How we use information</h2>
        <p>We use this information to send requested and proactive coaching texts, understand task commands, avoid interrupting busy or quiet periods, measure whether a nudge helped, remember user-corrected preferences, prevent abuse, troubleshoot delivery, and improve the service.</p>
        <p>Tempo does not sell personal information or use SMS consent data for third-party advertising.</p>
      </section>
      <section>
        <h2>Service providers</h2>
        <p>Tempo relies on vendors that process information only to operate the service, including SMS delivery, cloud hosting and databases, Google Calendar authorization, and AI model processing. Task text, relevant conversation context, and selected coaching memory may be sent to the AI provider to interpret or compose a response. We limit that context to what the request needs.</p>
      </section>
      <section>
        <h2>Retention and security</h2>
        <p>We retain account information while the account is active and as needed for the pilot, security, legal compliance, and reliable operation. Expired authorization state and temporary rate-limit records are automatically removed. Calendar disconnect deletes cached busy windows and stored Google credentials. Account deletion removes the account and associated tasks, messages, calendar data, interventions, outcomes, and memory from the active database.</p>
        <p>We use access controls, encrypted connections, encrypted calendar tokens, signed action links, and limited operational logs. No system can guarantee absolute security.</p>
      </section>
      <section>
        <h2>Your choices</h2>
        <ul>
          <li>Reply <strong>STOP</strong> to stop recurring texts and <strong>START</strong> to opt in again.</li>
          <li>Text <strong>leave me alone</strong> to pause coaching messages for seven days.</li>
          <li>Text <strong>disconnect calendar</strong> for a secure removal link.</li>
          <li>Text <strong>delete my account</strong> for a confirmation-gated deletion link.</li>
          <li>Correct or ask Tempo to forget a remembered preference by text.</li>
        </ul>
      </section>
      <section>
        <h2>Children and changes</h2>
        <p>Tempo is intended for people age 18 or older. We may update this policy as the service changes; a new effective date and version will identify material revisions.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Reply <strong>HELP</strong> to the Tempo number for service contact instructions. You can also use the account controls above for privacy requests.</p>
      </section>
    </LegalPage>
  );
}
