import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FiArrowDown, FiArrowRight, FiCalendar, FiCheckCircle, FiClock, FiMessageCircle, FiShield } from "react-icons/fi";
import { Header } from "../components/Header";
import { Reveal } from "../components/Reveal";

export const metadata: Metadata = {
  title: "How Tempo works",
  description: "See how Tempo remembers what matters, notices the right moment, and texts first with a manageable next step.",
};

const steps = [
  { number: "01", icon: FiCheckCircle, title: "Remember what matters", body: "Tell Tempo what you want to follow through on. It keeps the commitment in context so you do not have to keep rebuilding the plan." },
  { number: "02", icon: FiCalendar, title: "Notice the moment", body: "With your permission, Tempo understands the open windows around your calendar and tasks—without turning every free minute into an alert." },
  { number: "03", icon: FiClock, title: "Choose when to help", body: "Tempo considers timing, urgency, and your past responses before deciding whether a message would actually be useful." },
  { number: "04", icon: FiMessageCircle, title: "Text first", body: "You get one clear, manageable next step by text. No dashboard to remember, no blank chat box waiting for a prompt." },
];

const examples = [
  { label: "An open window", meta: "10:24 AM · Before your next meeting", message: "You’ve got 28 minutes free. Want to make the outline before your 11:00?", reply: "Start a blank doc with me" },
  { label: "A gentle reset", meta: "2:18 PM · After a stalled task", message: "The proposal is still open. Want to write one imperfect first sentence together?", reply: "Give me a starter" },
  { label: "Useful momentum", meta: "6:07 PM · Before dinner", message: "You planned a short walk today. Shoes on for five minutes, then decide?", reply: "Okay, five minutes" },
];

export default function HowItWorksPage() {
  return (
    <main className="inner-page how-page">
      <Header />
      <section className="inner-hero how-hero section-shell">
        <div className="inner-hero-copy">
          <p className="eyebrow">How Tempo works</p>
          <h1>The right nudge, right when it matters.</h1>
          <p className="inner-lede">Tempo turns the commitments already in your life into well-timed, manageable next steps—then reaches out first.</p>
          <div className="hero-actions">
            <Link className="black-button page-cta" href="/#early-access">Meet Tempo <FiArrowRight aria-hidden="true" /></Link>
            <a className="text-button" href="#flow">See the flow <FiArrowDown aria-hidden="true" /></a>
          </div>
        </div>
        <div className="how-hero-visual" aria-hidden="true">
          <span className="visual-note note-one">Calendar clear until 11:00</span>
          <Image src="/images/tempo-avatar.png" alt="" width={360} height={329} priority />
          <span className="visual-note note-two">A useful moment to begin</span>
        </div>
      </section>

      <section className="flow-section section-shell" id="flow" aria-labelledby="flow-title">
        <Reveal className="section-heading">
          <p className="eyebrow">A simple loop</p>
          <h2 id="flow-title">Less managing. More moving.</h2>
          <p>Tempo does the remembering and timing in the background. You stay focused on the next thing that matters.</p>
        </Reveal>
        <div className="steps-grid">
          {steps.map(({ number, icon: Icon, title, body }, index) => (
            <Reveal key={title} delay={index * 90} className="step-card">
              <div className="step-card-top"><span className="step-number">{number}</span><Icon aria-hidden="true" /></div>
              <h3>{title}</h3>
              <p>{body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="examples-section" aria-labelledby="examples-title">
        <div className="section-shell">
          <Reveal className="section-heading light-heading">
            <p className="eyebrow">What it feels like</p>
            <h2 id="examples-title">Small messages. Real momentum.</h2>
            <p>Every intervention is short, specific, and designed to make starting feel lighter.</p>
          </Reveal>
          <div className="examples-grid">
            {examples.map((example, index) => (
              <Reveal key={example.label} delay={index * 100} className="example-card">
                <p className="example-label">{example.label}</p>
                <p className="example-meta">{example.meta}</p>
                <div className="example-message">{example.message}</div>
                <div className="example-reply">{example.reply}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="trust-section section-shell">
        <Reveal className="trust-panel">
          <div className="trust-icon"><FiShield aria-hidden="true" /></div>
          <div>
            <p className="eyebrow">Always on your terms</p>
            <h2>Helpful context, with clear boundaries.</h2>
            <p>You choose which context Tempo can use. Pause messages, change the plan, or opt out whenever you want. Tempo is a coach—not a medical product or a substitute for professional care.</p>
          </div>
        </Reveal>
      </section>

      <section className="page-end-cta section-shell">
        <Reveal>
          <Image src="/images/tempo-avatar.png" alt="Tempo robot" width={120} height={110} />
          <p className="eyebrow">Ready when you are</p>
          <h2>Make the next step the easy one.</h2>
          <Link className="black-button page-cta" href="/#early-access">Join early access <FiArrowRight aria-hidden="true" /></Link>
        </Reveal>
      </section>
    </main>
  );
}
