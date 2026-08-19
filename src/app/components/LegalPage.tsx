import Link from "next/link";
import { ReactNode } from "react";
import { Header } from "./Header";

export function LegalPage({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
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
          <p className="legal-effective">Effective August 18, 2026 · Version 2026-08-18.v1</p>
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
