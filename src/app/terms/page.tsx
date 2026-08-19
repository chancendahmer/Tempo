import type { Metadata } from "next";
import { LegalPage } from "../components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | Tempo",
  description: "Terms for using Tempo's SMS executive-function coaching service.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms of service"
      title="Clear expectations for coaching by text."
      summary="These terms govern your use of Tempo's early-access SMS coaching service. By signing up or using Tempo, you agree to them."
    >
      <section>
        <h2>The service</h2>
        <p>Tempo is an early-access productivity and executive-function coaching tool delivered primarily by SMS. It can record tasks, use connected calendar availability, send proactive nudges, and learn from your feedback. Features may change, pause, or be withdrawn during the pilot.</p>
      </section>
      <section>
        <h2>Not medical or emergency support</h2>
        <p>Tempo is not medical care, mental-health treatment, crisis support, or a substitute for a licensed professional. It may make mistakes and should not be relied on for emergencies, safety-critical decisions, legal advice, or financial advice. If you may be in danger or experiencing an emergency, contact local emergency services.</p>
      </section>
      <section>
        <h2>SMS terms and consent</h2>
        <p>By checking the signup consent box, you agree to receive recurring automated coaching and service texts from Tempo at the number you provide. Message frequency varies. Message and data rates may apply. Consent is not a condition of purchase.</p>
        <p>Reply <strong>STOP</strong> to opt out, <strong>START</strong> to opt in again, or <strong>HELP</strong> for help. Carriers are not liable for delayed or undelivered messages. You must own or be authorized to use the phone number you provide and keep it accurate.</p>
      </section>
      <section>
        <h2>Your responsibilities</h2>
        <p>You must be at least 18 years old. Do not use Tempo unlawfully, attempt to access another person&apos;s data, disrupt the service, reverse engineer security controls, or submit content you do not have the right to use. You remain responsible for your tasks, calendar, decisions, and actions.</p>
      </section>
      <section>
        <h2>Connected services and AI</h2>
        <p>Google Calendar connection is optional and read-only in V1. Third-party services such as mobile carriers, Google, cloud infrastructure, and AI providers operate under their own terms and may affect availability. AI-generated messages can be incomplete or inaccurate; use your judgment.</p>
      </section>
      <section>
        <h2>Privacy and account controls</h2>
        <p>Our Privacy Policy explains how information is handled. You can disconnect Calendar or request account deletion through secure links sent by SMS. Deletion is permanent once confirmed, subject to limited records we may be legally required to retain.</p>
      </section>
      <section>
        <h2>Availability and liability</h2>
        <p>Tempo is provided on an “as is” and “as available” basis during early access, to the maximum extent allowed by law. We do not promise uninterrupted delivery or any particular productivity outcome. To the maximum extent allowed by law, Tempo is not liable for indirect, incidental, special, consequential, or punitive damages arising from use of the service.</p>
      </section>
      <section>
        <h2>Ending use and updates</h2>
        <p>You may stop using Tempo at any time. We may suspend use that threatens users, providers, or the service. We may update these terms as Tempo evolves; material revisions will use a new effective date and version.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Reply <strong>HELP</strong> to the Tempo number for service contact instructions.</p>
      </section>
    </LegalPage>
  );
}
