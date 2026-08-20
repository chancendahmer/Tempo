import { Header } from "../components/Header";
import { ExtensionsClient } from "./ExtensionsClient";

export default function ExtensionsPage() {
  return (
    <main className="account-page extensions-page">
      <Header />
      <section className="account-shell"><ExtensionsClient /></section>
    </main>
  );
}
