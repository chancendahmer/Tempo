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
        <p>Enter your number on the home page and follow the texting instructions. If you already have an account, text START to Tempo within 30 minutes, then return to this browser to finish signing in.</p>
        <Link className="black-button" href="/#early-access">Continue with phone <FiArrowRight /></Link>
      </section>
    </main>
  );
}
