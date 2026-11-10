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
        <p>Use your texting number to securely open the same account for your messages and workspace. We’ll guide you through the next step.</p>
        <Link className="black-button" href="/#early-access">Continue with phone <FiArrowRight /></Link>
      </section>
    </AccountShell>
  );
}
