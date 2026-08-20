"use client";

import Link from "next/link";
import { FiArrowRight, FiSliders } from "react-icons/fi";
import { useAccountStatus } from "./account-state";

export function ProfileReminder() {
  const { account } = useAccountStatus(8_000);
  if (!account?.phoneVerified || account.profileComplete) return null;
  return (
    <aside className="profile-reminder" aria-label="Complete your Tempo profile">
      <span className="profile-reminder-icon" aria-hidden="true"><FiSliders /></span>
      <span><strong>Make Tempo sound like yours.</strong> Add your name and coaching instructions so replies fit you.</span>
      <Link href="/profile">Customize profile <FiArrowRight aria-hidden="true" /></Link>
    </aside>
  );
}
