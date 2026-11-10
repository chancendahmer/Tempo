import { Children, isValidElement, type FormEvent, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FoodEntryEditor } from "./FoodEntryEditor";
import { CopyFood } from "./NutritionView";
import { WorkoutLogEditor } from "./WorkoutLogEditor";
import { RoutineEditor } from "./RoutineEditor";
import type { SavedLifeItem } from "../../server/domain/life-items";
import type { SavedFood } from "./nutrition-model";

vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState: <T,>(initial: T | (() => T)) => [typeof initial === "function" ? (initial as () => T)() : initial, vi.fn()],
  useRef: <T,>(value: T) => ({ current: value }),
  useEffect: vi.fn(),
  useId: () => "fixture-editor",
}));

afterEach(() => vi.unstubAllGlobals());

const entry: SavedFood = { id: "food", version: 1, data: { kind: "food", title: "Lentil soup", date: "2026-11-10", meal: "Lunch", calories: 180, protein: 9, carbs: null, fat: null, fiber: null, favorite: true } };
type FormProps = { children: ReactNode; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> };

async function submit(dialog: ReactElement<{ children: ReactNode }>, edits: Record<string, string>) {
  const form = Children.toArray(dialog.props.children).find(child => isValidElement<FormProps>(child) && child.type === "form") as ReactElement<FormProps>;
  const fields = new FormData();
  for (const [key, value] of Object.entries(edits)) fields.set(key, value);
  const nativeForm = {} as HTMLFormElement;
  const snapshot = vi.fn(function () { return fields; });
  vi.stubGlobal("FormData", snapshot);
  await form.props.onSubmit({ currentTarget: nativeForm, preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>);
  expect(snapshot).toHaveBeenCalledWith(nativeForm);
}

describe("native diary date submission", () => {
  it("uses the displayed copy date after other form edits, preserving scaled and unknown amounts", async () => {
    const save = vi.fn(async () => true), copied = vi.fn();
    const dialog = CopyFood({ item: entry, date: entry.data.date, saving: false, save, close: vi.fn(), copied });
    await submit(dialog, { date: "2026-11-12", meal: "Dinner", multiplier: "0.5" });
    expect(save).toHaveBeenCalledWith({ ...entry.data, date: "2026-11-12", meal: "Dinner", calories: 90, protein: 4.5, favorite: false });
    expect(copied).toHaveBeenCalledWith("2026-11-12");
  });

  it("uses the displayed manual entry date instead of the date from the initial draft", async () => {
    const save = vi.fn(async () => true), close = vi.fn();
    const dialog = FoodEntryEditor({ date: entry.data.date, item: entry, latestItem: entry, saving: false, save, close });
    await submit(dialog, { date: "2026-11-11" });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-11-11", title: "Lentil soup", calories: 180, protein: 9, carbs: null }), entry);
    expect(close).toHaveBeenCalledOnce();
  });

  it("uses the displayed completed movement date and preserves the plan link", async () => {
    const save = vi.fn(async () => true), close = vi.fn();
    const programId = "00000000-0000-4000-8000-000000000001";
    const draft = { title: "Riverside walk", minutes: 12, activity: "Walk" as const, programId, sessionName: "Afternoon walk" };
    const dialog = WorkoutLogEditor({ date: "2026-11-10", today: "2026-11-10", draft, saving: false, save, close });
    await submit(dialog, { date: "2026-11-09" });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ ...draft, kind: "workout", date: "2026-11-09" }), undefined);
    expect(close).toHaveBeenCalledOnce();
  });

  it("uses the displayed routine start time and preserves completed step identity", async () => {
    const save = vi.fn(async () => true), close = vi.fn();
    const step = { id: "00000000-0000-4000-8000-000000000002", title: "Hang up keys", minutes: 1, completedOn: "2026-11-10" };
    const item: SavedLifeItem = { id: "routine", version: 1, data: { kind: "routine", title: "Quick hallway reset", period: "morning", time: "08:00", steps: [step] } };
    const dialog = RoutineEditor({ item, latestItem: item, timezone: "America/New_York", saving: false, onSave: save, onClose: close, onReload: vi.fn() });
    await submit(dialog, { time: "09:15" });
    expect(save).toHaveBeenCalledWith({ ...item.data, time: "09:15" }, item);
    expect(close).toHaveBeenCalledOnce();
  });
});
