"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { FiArrowRight, FiCheck, FiX } from "react-icons/fi";
import { WorkspaceAvatar } from "../components/WorkspaceAvatar";
import { loopDialogTab } from "./dialog-keyboard";
import { positionTour } from "./tour-position";
import s from "./workspace-tour.module.css";

export type TourSection = "today" | "inbox" | "settings";

type Step = {
  section: TourSection;
  anchor: string;
  title: string;
  body: string;
};

const steps: Step[] = [
  { section: "today", anchor: "spaces", title: "Find your spaces", body: "Spaces opens Planner, Daily rhythm, Food & fitness, and Brain dump. On other pages, use the three-line navigation button beside Tempo to get back to these spaces." },
  { section: "today", anchor: "current", title: "See what’s next", body: "In Automatic mode, this banner follows your day: your current timer comes first, then a routine, plan or task. After the tour, try its button—or choose a different task from Your to-do below." },
  { section: "today", anchor: "timer", title: "Start with a few minutes", body: "Use Start beside a task for a short focus timer. You can pause, add time, or finish when you’re ready. Continue brings you back to an active timer." },
  { section: "inbox", anchor: "capture", title: "Catch a thought", body: "Use Capture when an idea or loose end comes up. It saves to Thoughts, where you can turn it into a task or a goal when you’re ready." },
  { section: "today", anchor: "ask", title: "Ask me for a hand", body: "Use this message box to add a task, adjust a plan, or ask for help getting started. You can also open Ask Tempo from the navigation button. With a verified account, your web and text conversations stay together." },
  { section: "settings", anchor: "connections", title: "Bring your calendar along", body: "Manage connections is where you can link Google Calendar to see events in Tempo. You can remove access later, and I’ll ask before making calendar changes." },
  { section: "settings", anchor: "checkins", title: "Choose your check-ins", body: "Text check-ins are optional. Choose here whether I can text you first when a check-in could help. Delivery depends on availability and follows your quiet hours. Change your choice anytime." },
];

const signup: Step = { section: "today", anchor: "signup", title: "Make it your workspace", body: "Join the private pilot with the phone number on your invitation. If you already have an account, use that number to sign in. Once verified, your workspace and texts share your Tempo account." };

export function WorkspaceTour({ preview, hasTasks, returnToSetup = false, scope, onSection, onClose }: {
  preview: boolean;
  hasTasks: boolean;
  returnToSetup?: boolean;
  scope: RefObject<HTMLDivElement | null>;
  onSection: (section: TourSection) => void;
  onClose: (destination?: TourSection) => void;
}) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const spotlight = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const countId = useId();
  const total = steps.length + Number(preview);
  const step = steps[index] ?? signup;
  const last = index === total - 1;
  const emptyTasks = step.anchor === "timer" && !hasTasks;
  const anchor = emptyTasks ? "add-task" : step.anchor;
  const body = emptyTasks ? "Add a task here. Its row will have a Start button for a short focus timer. You can pause, add time, or finish when you’re ready."
    : preview && anchor === "checkins" ? "You’re viewing a sample preference. In your own account, choose whether I can text you first. Delivery depends on availability and follows your quiet hours."
    : step.body;

  useLayoutEffect(() => {
    const modal = dialog.current;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    modal?.showModal();
    return () => {
      modal?.close();
      root.style.overflow = previousOverflow;
    };
  }, []);

  useLayoutEffect(() => {
    const modal = dialog.current;
    const ring = spotlight.current;
    const bubble = panel.current;
    const workspace = scope.current;
    if (!modal || !ring || !bubble || !workspace) return;

    let frame = 0;
    let activeTarget: HTMLElement | null = null;

    const update = (reveal = false) => {
      const target = workspace.querySelector<HTMLElement>(`[data-tour-anchor="${anchor}"]`);
      if (target !== activeTarget) {
        if (activeTarget) sizes.unobserve(activeTarget);
        if (target) sizes.observe(target);
        activeTarget = target;
        reveal = true;
      }

      const viewport = { width: modal.clientWidth, height: modal.clientHeight };
      const panelSize = { width: bubble.offsetWidth, height: bubble.offsetHeight };
      const stickyHeader = workspace.querySelector<HTMLElement>("[data-tour-sticky-header]");
      const visibleTop = target && stickyHeader && !stickyHeader.contains(target) ? stickyHeader.getBoundingClientRect().bottom : 0;
      let rect = target?.getBoundingClientRect() ?? null;
      if (target && rect && (rect.top < visibleTop + 4 || rect.bottom > viewport.height - 4)) {
        reveal = true;
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        rect = target.getBoundingClientRect();
      }

      let layout = positionTour(rect, panelSize, viewport);
      if (rect && reveal && layout.panel.side === "center") {
        // Set aside room for the bubble on a short screen before falling back to overlap.
        window.scrollBy({ top: rect.top - visibleTop - 12, behavior: "instant" });
        layout = positionTour(target?.getBoundingClientRect() ?? null, panelSize, viewport);
      }

      const { highlight, panel: placement } = layout;
      modal.dataset.spotlight = String(Boolean(highlight));
      if (highlight) {
        ring.style.left = `${highlight.left}px`;
        ring.style.top = `${highlight.top}px`;
        ring.style.width = `${highlight.right - highlight.left}px`;
        ring.style.height = `${highlight.bottom - highlight.top}px`;
      }
      bubble.style.left = `${placement.left}px`;
      bubble.style.top = `${placement.top}px`;
      bubble.style.setProperty("--pointer", `${placement.pointer}px`);
      bubble.dataset.side = placement.side;
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => update());
    };
    const sizes = new ResizeObserver(schedule);
    sizes.observe(bubble);
    sizes.observe(workspace);
    const changes = new MutationObserver(schedule);
    changes.observe(workspace, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    heading.current?.focus({ preventScroll: true });
    update(true);

    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      changes.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, [anchor, scope]);

  function show(next: number) {
    onSection((steps[next] ?? signup).section);
    setIndex(next);
  }

  return <dialog ref={dialog} className={s.overlay} aria-labelledby={headingId} aria-describedby={`${countId} ${descriptionId}`} onKeyDown={loopDialogTab} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className={s.shade} aria-hidden="true" />
    <div ref={spotlight} className={s.spotlight} aria-hidden="true" />
    <div ref={panel} className={s.bubble}>
      <div className={s.surface}>
        <header className={s.header}>
          <span className={s.mascot}><WorkspaceAvatar size={46} /></span>
          <div className={s.guideLabel}><strong>Tempo’s guide</strong><span id={countId}>{index + 1} of {total}</span></div>
          <button type="button" className={s.close} aria-label="Close tour" onClick={() => onClose()}><FiX aria-hidden="true" /></button>
        </header>
        <h2 id={headingId} ref={heading} tabIndex={-1} aria-describedby={`${countId} ${descriptionId}`}>{step.title}</h2>
        <p id={descriptionId}>{body}</p>
        {step.anchor === "signup" && <Link className={s.actionLink} href="/#early-access">Continue with phone <FiArrowRight aria-hidden="true" /></Link>}
        {last && !preview && !returnToSetup && <button type="button" className={s.actionLink} onClick={() => onClose("settings")}>Open Settings <FiArrowRight aria-hidden="true" /></button>}
        <footer className={s.actions}>
          <button type="button" className={s.skip} onClick={() => onClose()}>Skip tour</button>
          <div>
            {index > 0 && <button type="button" className={s.back} onClick={() => show(index - 1)}>Back</button>}
            <button type="button" className={s.next} onClick={() => last ? onClose() : show(index + 1)}>{last ? <>{returnToSetup ? "Back to setup" : "Done"} <FiCheck aria-hidden="true" /></> : <>Next <FiArrowRight aria-hidden="true" /></>}</button>
          </div>
        </footer>
      </div>
    </div>
  </dialog>;
}
