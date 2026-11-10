import { expect, it } from "vitest";
import { taskPresentation } from "./task-presentation";

it.each(["ai", "fallback"])("rejects a stored %s timer longer than the current total estimate without claiming AI provenance", source => {
  expect(taskPresentation({ title: "Write outline", estimatedMinutes: 2, presentation: { title: "Write outline", source, category: "work", focusMinutes: 20 } }))
    .toEqual({ title: "Write outline", category: "work", focusMinutes: 2, source: "fallback" });
});

it("preserves valid manual timer preferences independently of total duration and renamed titles", () => {
  const manual = { title: "Old title", source: "manual", category: "food", focusMinutes: 20 };
  expect(taskPresentation({ title: "New title", estimatedMinutes: 2, presentation: manual })).toEqual(manual);
  expect(taskPresentation({ title: "New title", estimatedMinutes: 2, presentation: { ...manual, focusMinutes: 61 } })).toMatchObject({ focusMinutes: 2, source: "fallback" });
});

it("retains a matching automatic presentation within its estimate or without a known estimate", () => {
  const presentation = { title: "Write outline", source: "ai", category: "work", focusMinutes: 10 };
  for (const estimatedMinutes of [10, 30, null, undefined]) expect(taskPresentation({ title: "Write outline", estimatedMinutes, presentation })).toEqual(presentation);
});
