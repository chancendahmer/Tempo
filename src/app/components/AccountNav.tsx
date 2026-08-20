"use client";

import Link from "next/link";
import { FiUser } from "react-icons/fi";
import { useAccountStatus } from "./account-state";

export function AccountNav({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { account } = useAccountStatus(5_000);
  if (account?.phoneVerified) {
    return (
      <Link className={mobile ? "black-button" : "profile-nav"} href="/profile" onClick={onNavigate}>
        <span className="profile-nav-avatar" aria-hidden="true"><FiUser /></span>
        <span>{account.displayName?.split(/\s+/)[0] || "Profile"}</span>
      </Link>
    );
  }
  if (account && !account.phoneVerified) {
    return <Link className="black-button nav-login" href="/#early-access" onClick={onNavigate}>Finish setup</Link>;
  }
  return <Link className="black-button nav-login" href="/login" onClick={onNavigate}>Log in</Link>;
}
