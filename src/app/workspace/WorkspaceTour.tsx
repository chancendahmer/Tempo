"use client";
import { loopDialogTab } from "./dialog-keyboard";
import { useEffect, useRef, useState } from "react";
import { FiArrowRight, FiBookOpen, FiCalendar, FiMessageCircle, FiSun, FiX } from "react-icons/fi";
import s from "./workspace.module.css";

const steps = [
  { title: "Start with today", body: "See what’s next, check off a routine step, or give one task a few focused minutes.", icon: FiSun, destination: "today", action: "Go to Today" },
  { title: "Make room for your plans", body: "To-do, Calendar, Goals, and Reminders live in Planner. Daily rhythm holds your routines and sunrise or sunset sessions.", icon: FiCalendar, destination: "tasks", action: "Open Planner" },
  { title: "Keep it all in one place", body: "Food & fitness holds meals, groceries, your food log, and workouts. Brain dump keeps your thoughts and saved memories together.", icon: FiBookOpen, destination: "meals", action: "Open Food & fitness" },
  { title: "You can just ask", body: "Text Tempo or use the message box. Ask for a task, a change of plan, or help getting started. Check-ins are always your choice.", icon: FiMessageCircle, destination: "assistant", action: "Ask Tempo" },
] as const;
export function WorkspaceTour({ onClose, onGo }: { onClose: () => void; onGo: (value: "today" | "tasks" | "meals" | "assistant") => void }) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const step = steps[index];
  const Icon = step.icon;
  return <dialog onKeyDown={loopDialogTab} ref={dialog} className={`${s.dialog} ${s.tour}`} aria-labelledby="tour-title" onCancel={onClose}>
    <div className={s.between}><small>{index + 1} of {steps.length}</small><button className={s.iconButton} onClick={onClose} aria-label="Close tour"><FiX /></button></div>
    <span className={s.tourIcon}><Icon /></span><h2 id="tour-title">{step.title}</h2><p>{step.body}</p>
    <button className={s.textButton} onClick={() => onGo(step.destination)}>{step.action} <FiArrowRight /></button>
    <div className={s.dialogActions}>{index > 0 ? <button className={s.secondary} onClick={() => setIndex(i => i - 1)}>Back</button> : <button className={s.secondary} onClick={onClose}>Skip tour</button>}<button className={s.primary} onClick={() => index === steps.length - 1 ? onClose() : setIndex(i => i + 1)}>{index === steps.length - 1 ? "Got it" : "Next"} <FiArrowRight /></button></div>
  </dialog>;
}
