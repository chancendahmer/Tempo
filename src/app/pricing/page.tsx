import type { Metadata } from "next";
import Link from "next/link";
import { FiArrowRight, FiCheck, FiHelpCircle } from "react-icons/fi";
import { Header } from "../components/Header";
import { Reveal } from "../components/Reveal";

export const metadata: Metadata = {
  title: "Tempo pricing",
  description: "Choose a Tempo plan for proactive, personalized support by text.",
};

const plans = [
  { name: "Free", price: "$0", cadence: "forever", description: "A calm place to start building momentum.", features: ["Up to 3 active commitments", "Proactive text check-ins", "Simple timing preferences", "Weekly progress recap"], cta: "Get started free", featured: false },
  { name: "Pro", price: "$12", cadence: "per month", description: "Everyday support that adapts to how you work.", features: ["Unlimited commitments", "Calendar and task context", "Personalized coaching strategies", "Smarter intervention timing", "Pause and focus modes"], cta: "Start with Pro", featured: true },
  { name: "Premium", price: "$29", cadence: "per month", description: "Deeper context for more complex days and goals.", features: ["Everything in Pro", "Multiple calendars and workspaces", "Longer coaching history", "Advanced patterns and insights", "Priority access to new features"], cta: "Choose Premium", featured: false },
];

const faqs = [
  { question: "Can I change plans later?", answer: "Yes. You will be able to move between plans or return to Free at any time." },
  { question: "Does Tempo send unlimited texts?", answer: "Tempo is designed to text only when a message is likely to help. Plan limits and fair-use details will be clear before paid access opens." },
  { question: "Is my calendar required?", answer: "No. Calendar and task context are optional, and you choose what Tempo is allowed to use." },
];

export default function PricingPage() {
  return (
    <main className="inner-page pricing-page">
      <Header />
      <section className="pricing-hero section-shell">
        <p className="eyebrow">Simple pricing</p>
        <h1>Choose the support that fits your day.</h1>
        <p className="inner-lede">Start free. Upgrade when you want more context, personalization, and support.</p>
        <div className="pricing-note"><span /> Early-access pricing · cancel anytime</div>
      </section>

      <section className="pricing-grid section-shell" aria-label="Tempo plans">
        {plans.map((plan, index) => (
          <Reveal key={plan.name} delay={index * 100} className={`pricing-card ${plan.featured ? "featured-plan" : ""}`}>
            {plan.featured && <span className="popular-label">Most popular</span>}
            <div className="plan-heading"><h2>{plan.name}</h2><p>{plan.description}</p></div>
            <div className="plan-price"><span>{plan.price}</span><small>{plan.cadence}</small></div>
            <ul>{plan.features.map((feature) => <li key={feature}><FiCheck aria-hidden="true" /> {feature}</li>)}</ul>
            <Link className={`plan-button ${plan.featured ? "black-button" : "outline-button"}`} href={`/?plan=${plan.name.toLowerCase()}#early-access`}>
              {plan.cta} <FiArrowRight aria-hidden="true" />
            </Link>
          </Reveal>
        ))}
      </section>

      <section className="pricing-detail section-shell">
        <Reveal className="pricing-detail-copy">
          <p className="eyebrow">Every plan stays human</p>
          <h2>More support should never mean more noise.</h2>
          <p>All three plans are built around the same promise: Tempo pays attention, chooses its moment, and keeps every message focused on a useful next step.</p>
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
        <Reveal><p className="eyebrow">Start with Tempo</p><h2>Your next step can be small.</h2><Link className="black-button page-cta" href="/#early-access">Get early access <FiArrowRight aria-hidden="true" /></Link></Reveal>
      </section>
    </main>
  );
}
