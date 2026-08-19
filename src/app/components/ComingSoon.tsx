import Link from "next/link";
import { TempoMark } from "./TempoMark";

export function ComingSoon({ title }: { title: string }) {
  return (
    <main className="placeholder-page">
      <TempoMark />
      <section>
        <p className="eyebrow">Tempo</p>
        <h1>{title}</h1>
        <p>This page is coming soon.</p>
        <Link className="black-button placeholder-home" href="/">
          Back to home
        </Link>
      </section>
    </main>
  );
}
