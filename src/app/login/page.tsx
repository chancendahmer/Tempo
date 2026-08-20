import Link from "next/link";
import { FiArrowRight, FiMessageCircle } from "react-icons/fi";
import { Header } from "../components/Header";

export default function LoginPage() {
  return (
    <main className="account-page">
      <Header />
      <section className="account-shell account-gate login-card">
        <span aria-hidden="true"><FiMessageCircle /></span>
        <p className="eyebrow">Phone-first account</p>
        <h1>Tempo uses your phone as your account.</h1>
        <p>Enter your number on the home page, then reply to Tempo’s message. This browser will recognize the verified phone automatically.</p>
        <Link className="black-button" href="/#early-access">Continue with phone <FiArrowRight /></Link>
      </section>
    </main>
  );
}
