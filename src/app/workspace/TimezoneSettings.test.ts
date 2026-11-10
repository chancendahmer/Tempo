import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimezoneSettings, timezoneLabel } from "./TimezoneSettings";

const hooks = vi.hoisted(() => ({ mounted: false, index: 0, state: [] as unknown[] }));
vi.mock("react", async original => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useId: () => hooks.mounted ? "timezone-picker" : react.useId(),
    useState: (initial: unknown) => {
      if (!hooks.mounted) return react.useState(initial);
      const index = hooks.index++;
      if (!(index in hooks.state)) hooks.state[index] = initial;
      return [hooks.state[index], (value: unknown) => { hooks.state[index] = value; }];
    },
  };
});
afterEach(() => { hooks.mounted = false; hooks.state = []; });

function renderMounted(timezone: string, timezoneConfirmedAt?: string) {
  hooks.mounted = true;
  hooks.index = 0;
  return TimezoneSettings({ timezone, timezoneConfirmedAt, onSave: async () => {} });
}

function control(node: ReactNode, tag: string): ReactElement<{ value: string; onChange: (event: { target: { value: string } }) => void }> | undefined {
  if (Array.isArray(node)) return node.map(child => control(child, tag)).find(Boolean);
  if (!isValidElement(node)) return undefined;
  if (node.type === tag) return node as ReturnType<typeof control>;
  return control((node.props as { children?: ReactNode }).children, tag);
}

describe("durable time zone confirmation", () => {
  it("renders saved server confirmation after a full remount and disables duplicate saving", () => {
    const render = () => renderToStaticMarkup(createElement(TimezoneSettings, { timezone: "Europe/London", timezoneConfirmedAt: "2026-10-22T15:00:00Z", onSave: async () => {} }));
    for (const html of [render(), render()]) {
      expect(html).toContain("Confirmed: London · Europe.");
      expect(html).toContain('disabled="">Time zone confirmed</button>');
      expect(html).not.toContain("You have an unsaved change");
      expect(html).not.toContain("Choose your city and confirm");
    }
  });
  it("offers readable city choices while retaining explicit confirmation for a fresh account", () => {
    const html = renderToStaticMarkup(createElement(TimezoneSettings, { timezone: "UTC", onSave: async () => {} }));
    expect(html).toContain("Choose your city and confirm its time zone.");
    expect(html).toContain("New York · Americas");
    expect(html).toContain("Another city or time zone…");
    expect(html).not.toContain('disabled="">Confirm time zone</button>');
    expect(timezoneLabel("America/Argentina/Buenos_Aires")).toBe("Buenos Aires · Americas");
  });

  it("keeps a pristine mounted picker aligned with a time zone saved elsewhere", () => {
    expect(control(renderMounted("UTC"), "select")!.props.value).toBe("UTC");
    const updated = renderMounted("America/New_York", "2026-11-10T21:15:00Z");
    expect(control(updated, "select")!.props.value).toBe("America/New_York");
    const html = renderToStaticMarkup(updated);
    expect(html).toContain("Confirmed: New York · Americas.");
    expect(html).not.toContain("You have an unsaved change.");
  });

  it("keeps a changed choice until it matches the saved zone", () => {
    const confirmed = "2026-11-10T21:15:00Z";
    const picker = control(renderMounted("UTC"), "select")!;
    picker.props.onChange({ target: { value: "Europe/London" } });
    const external = renderMounted("America/New_York", confirmed);
    expect(control(external, "select")!.props.value).toBe("Europe/London");
    expect(renderToStaticMarkup(external)).toContain("You have an unsaved change.");
    expect(renderToStaticMarkup(renderMounted("Europe/London", confirmed))).not.toContain("You have an unsaved change.");
    expect(control(renderMounted("America/Toronto", confirmed), "select")!.props.value).toBe("America/Toronto");
  });

  it("preserves an unfinished named-zone edit across a saved-zone update", () => {
    control(renderMounted("UTC"), "select")!.props.onChange({ target: { value: "custom" } });
    control(renderMounted("UTC"), "input")!.props.onChange({ target: { value: "Europe/Rom" } });
    const external = renderMounted("America/New_York", "2026-11-10T21:15:00Z");
    expect(control(external, "input")!.props.value).toBe("Europe/Rom");
    expect(renderToStaticMarkup(external)).toContain("You have an unsaved change.");
  });
});
