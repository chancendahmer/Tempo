import { WorkspaceAvatar } from "./WorkspaceAvatar";
import Link from "next/link";
import { FiArrowLeft } from "react-icons/fi";
import type { ReactNode } from "react";
import s from "./account-shell.module.css";

/** Account administration uses the same visual language without loading workspace data. */
export function AccountShell({ children }: { children: ReactNode }) {
  return <main className={s.root}><header className={s.header}><Link href="/workspace" className={s.brand}><WorkspaceAvatar />Tempo</Link><Link href="/workspace#settings" className={s.back}><FiArrowLeft /> Back to my workspace</Link></header><section className={`account-shell ${s.content}`}>{children}</section></main>;
}
