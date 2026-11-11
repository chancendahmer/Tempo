import Link from "next/link";
import { ConversationStage } from "./components/ConversationStage";
import { EarlyAccessCounter } from "./components/EarlyAccessCounter";
import { Header } from "./components/Header";
import { PhoneSignup } from "./components/PhoneSignup";
import { ProfileReminder } from "./components/ProfileReminder";

export default function Home() {
  return (
    <main className="landing-page">
      <Header />
      <section className="hero" aria-labelledby="hero-title">
        <ConversationStage />
        <div className="hero-copy">
          <h1 id="hero-title">
            Meet the AI that
            <span className="headline-line-two">pays attention.</span>
          </h1>
          <p>
            Tempo keeps tasks, routines, and reminders together{" "}
            <br className="desktop-break" />
            so you can plan by text or in your dashboard.
          </p>
        </div>

        <div className="conversion-area" id="early-access">
          <ProfileReminder />
          <PhoneSignup />
          <p className="signup-note" id="signup-note">
            Your texts and dashboard share one account. Reply STOP anytime.
          </p>
          <div className="proof-row">
            <EarlyAccessCounter />
            <span>Private pilot · invitation required</span>
          </div>

        </div>

        <footer className="legal-row">
          <span>Tempo texts you. Msg and data rates may apply. Reply STOP to stop.</span>
          <span className="legal-dot" aria-hidden="true" />
          <Link href="/terms">Terms</Link>
          <span className="legal-dot" aria-hidden="true" />
          <Link href="/privacy">Privacy</Link>
        </footer>
      </section>
    </main>
  );
}
