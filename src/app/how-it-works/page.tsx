import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FiArrowDown, FiArrowRight, FiCalendar, FiCheckCircle, FiClock, FiMessageCircle, FiShield } from "react-icons/fi";
import { Header } from "../components/Header";
import { Reveal } from "../components/Reveal";

export const metadata: Metadata = {
  title: "How Tempo works",
  description: "See how Tempo keeps tasks, routines, and reminders together by text and in your dashboard, with optional check-ins for eligible pilot accounts.",
};

const steps = [
  { number: "01", icon: FiCheckCircle, title: "Capture what’s on your mind", body: "Text Tempo or use the dashboard to add a task, set up a routine, or save a thought. Both share one Tempo account." },
  { number: "02", icon: FiCalendar, title: "Connect your calendar", body: "Connect Google Calendar to see your events in Tempo. Review proposed changes before Tempo edits your primary calendar." },
  { number: "03", icon: FiClock, title: "Ask for a reminder", body: "Ask Tempo to remind you about a task, appointment, or routine. Tempo can text the reminders you schedule." },
  { number: "04", icon: FiMessageCircle, title: "Choose optional check-ins", body: "Check-ins require your opt-in, completed text setup, and a current Google Calendar connection. The pilot team must also enable delivery for your account." },
];

const examples = [
  { label: "An open window", meta: "10:24 AM · Before your next meeting", message: "You’ve got 28 minutes free. Want to make the outline before your 11:00?", reply: "Help me get started" },
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
          <h1>A clear plan for the day ahead.</h1>
          <p className="inner-lede">Capture what you need to do, set a reminder, or ask Tempo to help you find a manageable next step. Start by text or in your dashboard.</p>
          <div className="hero-actions">
            <Link className="black-button page-cta" href="/#early-access">Meet Tempo <FiArrowRight aria-hidden="true" /></Link>
            <a className="text-button" href="#flow">See the flow <FiArrowDown aria-hidden="true" /></a>
          </div>
        </div>
        <div className="how-hero-visual" aria-hidden="true">
          <span className="visual-note note-one">Today · Lab report</span>
          <Image src="/images/tempo-avatar.png" alt="" width={360} height={329} priority />
          <span className="visual-note note-two">First step · Outline</span>
        </div>
      </section>

      <section className="flow-section section-shell" id="flow" aria-labelledby="flow-title">
        <Reveal className="section-heading">
          <p className="eyebrow">A simple loop</p>
          <h2 id="flow-title">Less managing. More moving.</h2>
          <p>Keep your plans together and choose the kind of support you want.</p>
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
            <p className="eyebrow">Optional check-ins</p>
            <h2 id="examples-title">What a check-in can look like.</h2>
            <p>These fictional examples show how a check-in might help you get started when delivery is enabled for your account.</p>
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
