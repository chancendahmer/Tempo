import Link from "next/link";
import { ReactNode } from "react";
import { Header } from "./Header";

export function LegalPage({
  eyebrow,
  title,
  summary,
  effectiveDate = "August 18, 2026",
  version = "2026-08-18.v1",
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  effectiveDate?: string;
  version?: string;
  children: ReactNode;
}) {
  return (
    <main className="legal-page">
      <Header />
      <div className="legal-shell">
        <header className="legal-intro">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{summary}</p>
          <p className="legal-effective">Effective {effectiveDate} · Version {version}</p>
        </header>
        <article className="legal-card">{children}</article>
        <nav className="legal-footer" aria-label="Legal navigation">
          <Link href="/">Home</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </div>
    </main>
  );
}
