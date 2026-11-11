import type { Metadata } from "next";
import Link from "next/link";
import { FiArrowRight, FiCheck, FiHelpCircle } from "react-icons/fi";
import { Header } from "../components/Header";
import { Reveal } from "../components/Reveal";

export const metadata: Metadata = {
  title: "Tempo pricing",
  description: "Tempo private-pilot access and proposed future subscription options.",
};

const plans = [
  { name: "Private pilot", price: "By invitation", cadence: "limited early access", description: "Help shape Tempo with a small group of early users.", features: ["Shared text and dashboard workspace", "Tasks, routines and requested reminders", "Meals, groceries, nutrition and workouts", "Optional check-ins as pilot availability allows"], cta: "Use my invitation", featured: true },
  { name: "Pro · proposed", price: "$12", cadence: "per month · not on sale", description: "A possible subscription after the pilot. Price and scope may change.", features: ["One connected daily-life workspace", "Calendar-aware planning", "Personalized coaching preferences", "Focus sessions and saved progress"], cta: "Explore the workspace", featured: false },
  { name: "Premium · exploring", price: "$29", cadence: "per month · not on sale", description: "An option we are researching, not an available product tier.", features: ["Potential deeper progress insights", "Future multi-calendar support", "Additional integrations under consideration", "No purchase or upgrade available yet"], cta: "See the pilot experience", featured: false },
];

const faqs = [
  { question: "Can I buy or change plans now?", answer: "Not yet. Tempo is an invitation-only private pilot. There is no subscription checkout, paid upgrade or billing connection in this experience. We will confirm final pricing and features before accepting subscriptions." },
  { question: "Does Tempo send unlimited texts?", answer: "Tempo is designed to text only when a message is likely to help. Plan limits and fair-use details will be clear before paid access opens." },
  { question: "Is my calendar required?", answer: "You can use the workspace and request reminders without it. Automatic open-window check-ins currently require a connected, recently synced Google Calendar, separate opt-in and completed text setup. The pilot supports your primary Google calendar." },
];

export default function PricingPage() {
  return (
    <main className="inner-page pricing-page">
      <Header />
      <section className="pricing-hero section-shell">
        <p className="eyebrow">Private pilot</p>
        <h1>Help shape the next version of Tempo.</h1>
        <p className="inner-lede">We’re testing with a small invited group. The subscription ideas below are proposals, not plans you can buy today.</p>
        <div className="pricing-note"><span /> No checkout or subscription charge on this site</div>
      </section>

      <section className="pricing-grid section-shell" aria-label="Tempo plans">
        {plans.map((plan, index) => (
          <Reveal key={plan.name} delay={index * 100} className={`pricing-card ${plan.featured ? "featured-plan" : ""}`}>
            {plan.featured && <span className="popular-label">Available by invitation</span>}
            <div className="plan-heading"><h2>{plan.name}</h2><p>{plan.description}</p></div>
            <div className={`plan-price${plan.featured ? " plan-price-label" : ""}`}><span>{plan.price}</span><small>{plan.cadence}</small></div>
            <ul>{plan.features.map((feature) => <li key={feature}><FiCheck aria-hidden="true" /> {feature}</li>)}</ul>
            <Link className={`plan-button ${plan.featured ? "black-button" : "outline-button"}`} href={plan.featured ? "/#early-access" : "/workspace/preview"}>
              {plan.cta} <FiArrowRight aria-hidden="true" />
            </Link>
          </Reveal>
        ))}
      </section>

      <section className="pricing-detail section-shell">
        <Reveal className="pricing-detail-copy">
          <p className="eyebrow">Built around your day</p>
          <h2>More support should never mean more noise.</h2>
          <p>The pilot is how we learn which support helps. Optional check-ins respect quiet hours and limits, and hardware and wearable integrations remain future work.</p>
        </Reveal>
        <Reveal className="pricing-detail-stat" delay={120}><span>1</span><p>clear next step<br />at a time</p></Reveal>
      </section>

      <section className="faq-section section-shell" aria-labelledby="faq-title">
        <Reveal className="faq-heading"><FiHelpCircle aria-hidden="true" /><p className="eyebrow">Good to know</p><h2 id="faq-title">A few quick answers.</h2></Reveal>
        <div className="faq-list">
          {faqs.map((faq, index) => <Reveal key={faq.question} delay={index * 70} className="faq-item"><h3>{faq.question}</h3><p>{faq.answer}</p></Reveal>)}
        </div>
      </section>

      <section className="pricing-end-cta section-shell">
        <Reveal><p className="eyebrow">Start with Tempo</p><h2>Your next step can be small.</h2><Link className="black-button page-cta" href="/workspace/preview">Try the sample workspace <FiArrowRight aria-hidden="true" /></Link></Reveal>
      </section>
    </main>
  );
}
