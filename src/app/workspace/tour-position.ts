type Size = { width: number; height: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
type Side = "below" | "above" | "right" | "left" | "center";

const margin = 12;
const gap = 16;
const padding = 6;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function positionTour(target: Bounds | null, panel: Size, viewport: Size) {
  const maxLeft = viewport.width - panel.width - margin;
  const maxTop = viewport.height - panel.height - margin;
  const centered = { side: "center" as Side, left: Math.max(margin, (viewport.width - panel.width) / 2), top: Math.max(margin, (viewport.height - panel.height) / 2), pointer: 0 };
  if (!target || target.bottom <= 0 || target.top >= viewport.height || target.right <= 0 || target.left >= viewport.width) {
    return { highlight: null, panel: centered };
  }

  const highlight = {
    left: Math.max(2, target.left - padding),
    top: Math.max(2, target.top - padding),
    right: Math.min(viewport.width - 2, target.right + padding),
    bottom: Math.min(viewport.height - 2, target.bottom + padding),
  };
  const centerX = (highlight.left + highlight.right) / 2;
  const centerY = (highlight.top + highlight.bottom) / 2;
  const alignedLeft = clamp(centerX - panel.width / 2, margin, maxLeft);
  const alignedTop = clamp(centerY - panel.height / 2, margin, maxTop);
  const pointerX = clamp(centerX - alignedLeft, 24, panel.width - 24);
  const pointerY = clamp(centerY - alignedTop, 24, panel.height - 24);
  const choices: { side: Side; left: number; top: number; pointer: number }[] = [
    { side: "below", left: alignedLeft, top: highlight.bottom + gap, pointer: pointerX },
    { side: "above", left: alignedLeft, top: highlight.top - gap - panel.height, pointer: pointerX },
    { side: "right", left: highlight.right + gap, top: alignedTop, pointer: pointerY },
    { side: "left", left: highlight.left - gap - panel.width, top: alignedTop, pointer: pointerY },
  ];
  const fit = choices.find(choice => choice.left >= margin && choice.left <= maxLeft && choice.top >= margin && choice.top <= maxTop);
  if (fit) return { highlight, panel: fit };

  // Short viewports can lack room for both. Leave the larger part of the target visible.
  const roomAbove = highlight.top;
  const roomBelow = viewport.height - highlight.bottom;
  return { highlight, panel: { ...centered, top: roomBelow >= roomAbove ? Math.max(margin, maxTop) : margin } };
}
