import { Fragment, type ReactNode } from "react";
import s from "./chat-message.module.css";

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https:\/\/[^\s)]+\)|https:\/\/[^\s<>]+)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const markdown = part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
    const target = markdown?.[2] ?? (part.startsWith("https://") ? part.replace(/[.,!?;:]+$/, "") : null);
    if (target) {
      try {
        const url = new URL(target);
        if (url.protocol === "https:" && !url.username && !url.password) return <Fragment key={index}><a href={url.href} target="_blank" rel="noopener noreferrer">{markdown?.[1] ?? target}</a>{markdown ? "" : part.slice(target.length)}</Fragment>;
      } catch { /* Invalid links remain ordinary text. */ }
    }
    return part;
  });
}

export function ChatMessage({ body }: { body: string }) {
  const lines = body.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length;) {
    if (!lines[i].trim()) { i++; continue; }
    const list = lines[i].match(/^\s*(?:([-*•])|(\d+)\.)\s+(.+)$/);
    if (list) {
      const ordered = !!list[2];
      const start = Number(list[2]);
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*(?:([-*•])|(\d+)\.)\s+(.+)$/);
        if (!item || !!item[2] !== ordered) break;
        items.push(<li key={i}>{inline(item[3])}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={i} start={start}>{items}</ol> : <ul key={i}>{items}</ul>);
    } else {
      blocks.push(<p key={i}>{inline(lines[i])}</p>);
      i++;
    }
  }
  return <div className={s.body}>{blocks}</div>;
}
