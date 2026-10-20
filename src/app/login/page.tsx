import Link from "next/link";
import { FiArrowRight, FiMessageCircle } from "react-icons/fi";
import { AccountShell } from "../components/AccountShell";

export default function LoginPage() {
  return (
    <AccountShell>
      <section className="account-gate login-card">
        <span aria-hidden="true"><FiMessageCircle /></span>
        <p className="eyebrow">WELCOME TO TEMPO</p>
        <h1>Your day, in one place.</h1>
        <p>Continue with your texting number. We’ll send you a secure sign-in link so your messages and workspace stay together.</p>
        <Link className="black-button" href="/#early-access">Continue with phone <FiArrowRight /></Link>
      </section>
    </AccountShell>
  );
}
