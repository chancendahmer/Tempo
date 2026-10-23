/** Keep Tab at the modal's controls rather than cycling through browser chrome. */
export function loopDialogTab(event: { key: string; shiftKey: boolean; currentTarget: HTMLDialogElement; preventDefault: () => void }) {
  if (event.key !== "Tab") return;
  const dialog = event.currentTarget;
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'))
    .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
  const first = controls[0], last = controls.at(-1);
  if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}
