import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TimezoneSettings, timezoneLabel } from "./TimezoneSettings";

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
});
