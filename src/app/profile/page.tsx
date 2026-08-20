import { Header } from "../components/Header";
import { ProfileClient } from "./ProfileClient";

export default function ProfilePage() {
  return (
    <main className="account-page">
      <Header />
      <section className="account-shell"><ProfileClient /></section>
    </main>
  );
}
