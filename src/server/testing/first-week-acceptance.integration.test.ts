import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { firstWeek } from "./first-week-fixtures";
import { mutateWorkspace, readWorkspace } from "../db/repositories/workspace-repository";
import { saveGentleSetup } from "../db/repositories/gentle-setup-repository";
import { PilotFeedbackRepository } from "../db/repositories/pilot-feedback-repository";
import * as schema from "../db/schema";
import type { LifeItem } from "../domain/life-items";
import { localDay } from "../domain/life-items";
import { ingredientLabel } from "../domain/meal-groceries";
import { isFood, nutritionTotals, repeatFood } from "../../app/workspace/nutrition-model";
import { WebSessionService } from "../security/web-session";
import { DrizzleMessagingRepository } from "../db/repositories/messaging-repository";
import { DrizzleContextEngineRepository } from "../db/repositories/context-engine-repository";
import { DrizzleConsentRepository } from "../db/repositories/consent-repository";
import { recordWebConsent } from "../domain/consent";
import { evaluateContext, DEFAULT_CONTEXT_POLICY, type ContextSignals } from "../domain/context-engine";

// Fail immediately if a future fixture accidentally constructs a real model client.
vi.mock("@anthropic-ai/sdk", () => ({ default: class { constructor() { throw new Error("Paid clients forbidden in first-week acceptance"); } } }));

it("Maya: seven scripted days preserve thought identity, focus, reminders, corrections and private feedback", async () => {
  const w = await firstWeek(); const { simulator: sim, person } = w;
  const db = sim.database;
  const taskAction = (command: Parameters<typeof mutateWorkspace>[1] & { action: "task" }) => mutateWorkspace(person.id, command, db);
  try {
    const noteId = randomUUID(), body = "Ask studio about Saturday access. Preserve the full original detail. ".repeat(35);
    await saveGentleSetup(person.id, { action: "skip" }, db);
    await mutateWorkspace(person.id, { action: "save", id: noteId, version: 0, data: { kind: "note", title: "Studio access", body } }, db);
    await taskAction({ action: "task", requestId: randomUUID(), command: { type: "create_task", title: "Call studio", sourceNoteId: noteId, estimatedMinutes: 5 } });
    let saved = await w.checkpoint(1); const task = saved.tasks[0];
    expect(saved.items.find(row => row.id === noteId)?.data).toMatchObject({ body, taskId: task.id });
    expect(saved.setup.setupStatus).toBe("skipped");

    w.day(2);
    await w.turn("Convert this studio thought into a task", [{ type: "create_task", title: "Call studio", sourceNoteId: noteId, estimatedMinutes: 5 }], { channel: "web" });
    await taskAction({ action: "task", requestId: randomUUID(), command: { type: "start_task", taskId: task.id }, focusMinutes: 5 });
    saved = await person.workspace(); const focus = saved.items.find(row => row.data.kind === "focus")!;
    expect(focus.data).toMatchObject({ taskId: task.id, remaining: 300 });
    if (focus.data.kind !== "focus") throw new Error("Missing exact focus fixture");
    w.day(2, "15:01:00");
    await mutateWorkspace(person.id, { action: "save", id: focus.id, version: focus.version, data: { ...focus.data, endsAt: null, remaining: 240 } }, db);
    saved = await w.checkpoint(2);
    expect(saved.tasks.filter(row => row.title === "Call studio")).toHaveLength(1);
    expect(saved.tasks[0].status).toBe("in_progress");
    expect(saved.items.find(row => row.id === focus.id)?.data).toMatchObject({ taskId: task.id, endsAt: null, remaining: 240 });

    w.day(3);
    const paused = saved.items.find(row => row.id === focus.id)!;
    if (paused.data.kind !== "focus") throw new Error("Missing paused focus fixture");
    await mutateWorkspace(person.id, { action: "save", id: paused.id, version: paused.version, data: { ...paused.data, endsAt: new Date(Date.now() + 240000).toISOString() } }, db);
    expect((await person.workspace()).items.find(row => row.id === focus.id)?.data).toMatchObject({ remaining: 240, endsAt: "2027-01-13T15:04:00.000Z" });
    await taskAction({ action: "task", requestId: randomUUID(), command: { type: "complete_task", taskId: task.id } });
    expect((await person.workspace()).tasks[0].status).toBe("completed");
    await taskAction({ action: "task", requestId: randomUUID(), command: { type: "reopen_task", taskId: task.id } });
    await w.turn("Advice only: should I rename this task? Do not change anything.", [{ type: "update_task", taskId: task.id, patch: { title: "UNREQUESTED" } }], { readOnly: true });
    saved = await w.checkpoint(3); expect(saved.tasks[0]).toMatchObject({ title: "Call studio", status: "not_started" });

    w.day(4);
    // Web schedules the task; SMS separately requests a text, matching today's contract.
    const scheduled = { action: "task" as const, requestId: randomUUID(), command: { type: "create_task" as const, title: "Outline project", dueAt: "2027-01-15T15:00:00-05:00" } };
    await mutateWorkspace(person.id, scheduled, db); await mutateWorkspace(person.id, scheduled, db);
    const project = (await person.workspace()).tasks.find(row => row.title === "Outline project")!;
    expect((await person.workspace()).reminders).toHaveLength(0);
    const text = "Remind me Friday January 15 at 2 PM to outline project";
    const turn = await w.turn(text, [{ type: "create_reminder", text: "Outline project", remindAt: "2027-01-15T14:00:00-05:00", taskId: project.id }]);
    await person.send(text, { providerId: turn.providerId });
    saved = await w.checkpoint(4); const reminder = saved.reminders[0];
    expect(saved.tasks.filter(row => row.id === project.id)).toHaveLength(1);
    expect(project.dueAt?.toISOString()).toBe("2027-01-15T20:00:00.000Z");
    expect(reminder.remindAt.toISOString()).toBe("2027-01-15T19:00:00.000Z");
    expect(saved.reminders).toHaveLength(1);
    expect(await db.select().from(schema.scheduledActions).where(and(eq(schema.scheduledActions.reminderId, reminder.id), eq(schema.scheduledActions.status, "scheduled")))).toHaveLength(1);

    w.day(5, "19:00:00"); await w.deliver(reminder.id);
    expect(sim.transport.sent.filter(row => row.body === "Reminder: Outline project")).toHaveLength(1);
    await w.turn("I have a separate question about the studio", []);
    const moved = await w.turn("Move my delivered outline project reminder to Saturday January 16 at 2 PM", [{ type: "list_reminders", includePast: true }, { type: "reschedule_reminder", reminderId: reminder.id, remindAt: "2027-01-16T14:00:00-05:00" }]);
    expect(moved.replies.join(" ")).toContain("The original reminder was already delivered. A new reminder was saved");
    expect((await person.state()).reminders.find(row => row.id === reminder.id)).toMatchObject({ status: "sent", remindAt: new Date("2027-01-15T19:00:00Z") });
    await person.send("Move my delivered outline project reminder to Saturday January 16 at 2 PM", { providerId: moved.providerId });
    expect((await person.state()).reminders).toHaveLength(2);
    saved = await w.checkpoint(5); const followup = saved.reminders.find(row => row.status === "scheduled")!;
    expect(followup).toMatchObject({ remindAt: new Date("2027-01-16T19:00:00Z") });
    expect(saved.reminders.find(row => row.id === reminder.id)?.status).toBe("sent");

    w.day(6);
    await taskAction({ action: "task", requestId: randomUUID(), command: { type: "complete_task", taskId: project.id } });
    expect((await person.workspace()).reminders.find(row => row.id === followup.id)?.status).toBe("scheduled");
    await mutateWorkspace(person.id, { action: "remove_reminder", id: followup.id }, db);
    await taskAction({ action: "task", requestId: randomUUID(), command: { type: "abandon_task", taskId: task.id } });
    saved = await w.checkpoint(6);
    expect(saved.items.find(row => row.id === noteId)).toMatchObject({ data: { body, taskId: task.id }, linkedTask: { status: "abandoned" } });
    await expect(taskAction({ action: "task", requestId: randomUUID(), command: { type: "create_task", title: "Call studio", sourceNoteId: noteId } })).rejects.toThrow("removed");

    w.day(7);
    const current = saved.items.find(row => row.id === noteId)!;
    await mutateWorkspace(person.id, { action: "patch", id: noteId, version: current.version, patch: { kind: "note", title: "Studio access confirmed" } }, db);
    const retrieval = await w.turn("Show my saved studio thought", [{ type: "life_list", kind: "note", id: noteId }], { readOnly: true });
    expect(retrieval.toolTrace?.[0].result).toContain("Studio access confirmed");
    await expect(mutateWorkspace(w.outsider.id, { action: "patch", id: noteId, version: current.version + 1, patch: { kind: "note", title: "FOREIGN EDIT" } }, db)).rejects.toThrow("unavailable");
    await db.update(schema.users).set({ phoneVerifiedAt: new Date() }).where(eq(schema.users.id, person.id));
    const reports = new PilotFeedbackRepository(db), report = { requestId: randomUUID(), type: "problem" as const, section: "tasks" as const, impact: "slowed" as const, detail: "Synthetic lost-response concern", followUpConsent: false };
    const key = Buffer.alloc(32, 7).toString("base64");
    const receipt = await reports.submit(person.id, report, key);
    expect(await reports.submit(person.id, report, key)).toEqual(receipt);
    expect(await reports.receipt(w.outsider.id, receipt.id)).toBeNull();
    expect((await db.select().from(schema.pilotFeedback).where(eq(schema.pilotFeedback.userId, person.id)))).toHaveLength(1);
    saved = await w.checkpoint(7); expect(saved.reminders.find(row => row.id === followup.id)?.status).toBe("cancelled");
    expect(w.checkpoints).toEqual([1, 2, 3, 4, 5, 6, 7]);
  } finally { await w.close(); }
}, 30_000);


it("Luis: seven scripted days keep meal plans, shopping, pantry and actual consumption distinct", async () => {
  const w = await firstWeek(); const { simulator: sim, person } = w; const db = sim.database;
  const recipeId = randomUUID(), replacementId = randomUUID(), mealId = randomUUID(), manualId = randomUUID();
  const recipe: Extract<LifeItem, { kind: "recipe" }> = { kind: "recipe", title: "Rice bowl", ingredients: "200 g rice\n1 lemon", instructions: "Cook", servings: 2, prepMinutes: 20, favorite: false };
  const rows = async () => (await person.workspace()).items;
  const item = async (id: string) => (await rows()).find(row => row.id === id)!;
  const groceries = async () => (await rows()).filter(row => row.data.kind === "grocery");
  try {
    await mutateWorkspace(person.id, { action: "save", id: recipeId, version: 0, data: recipe }, db);
    await mutateWorkspace(person.id, { action: "save", id: manualId, version: 0, data: { kind: "grocery", title: "Tea for neighbor", checked: false } }, db);
    await mutateWorkspace(person.id, { action: "save", id: mealId, version: 0, sourceRecipeId: recipeId, data: { kind: "meal", title: "Sunday dinner", date: "2027-01-17", meal: "Dinner", ingredients: "Ignored shortcut", servings: 4 } }, db);
    expect((await groceries()).map(row => ingredientLabel(row.data)).sort()).toEqual(["400 g rice", "2 lemon", "Tea for neighbor"].sort());
    expect((await item(mealId)).data).toMatchObject({ ingredients: recipe.ingredients, ingredientServings: 2, servings: 4 });
    expect((await rows()).filter(isFood)).toHaveLength(0); await w.checkpoint(1);

    w.day(2);
    const edit = { action: "patch" as const, id: mealId, version: 1, patch: { kind: "meal" as const, servings: 2 } };
    await mutateWorkspace(person.id, edit, db); await mutateWorkspace(person.id, edit, db);
    expect((await groceries()).filter(row => row.data.title === "rice")).toHaveLength(1);
    expect((await groceries()).find(row => row.data.title === "rice")?.data).toMatchObject({ quantity: 200, mealSources: [{ mealId, quantity: 200 }] });
    await w.turn("Advice only: should I increase dinner portions? Do not edit it.", [{ type: "life_patch", id: mealId, version: 2, patch: { kind: "meal", servings: 8 } }], { readOnly: true });
    expect((await item(mealId)).data).toMatchObject({ servings: 2 }); await w.checkpoint(2);

    w.day(3);
    await mutateWorkspace(person.id, { action: "save", id: replacementId, version: 0, data: { ...recipe, title: "Garlic rice", ingredients: "300 g rice\n2 cloves garlic" } }, db);
    const current = await item(mealId);
    await mutateWorkspace(person.id, { action: "save", id: mealId, version: current.version, sourceRecipeId: replacementId, data: current.data }, db);
    expect((await groceries()).some(row => row.data.title === "lemon")).toBe(false);
    let meal = await item(mealId);
    await mutateWorkspace(person.id, { action: "patch", id: mealId, version: meal.version, patch: { kind: "meal", groceriesEnabled: false } }, db);
    expect((await groceries()).map(row => row.id)).toEqual([manualId]);
    meal = await item(mealId);
    await mutateWorkspace(person.id, { action: "patch", id: mealId, version: meal.version, patch: { kind: "meal", groceriesEnabled: true } }, db);
    expect((await groceries()).find(row => row.data.title === "rice")?.data).toMatchObject({ quantity: 300 }); await w.checkpoint(3);

    w.day(4);
    const rice = (await groceries()).find(row => row.data.title === "rice")!;
    await mutateWorkspace(person.id, { action: "patch", id: rice.id, version: rice.version, patch: { kind: "grocery", checked: true } }, db);
    expect((await rows()).filter(row => row.data.kind === "pantry")).toHaveLength(0);
    await mutateWorkspace(person.id, { action: "save", id: randomUUID(), version: 0, data: { kind: "pantry", title: "Rice", quantity: 100, unit: "g" } }, db);
    await mutateWorkspace(person.id, { action: "save", id: randomUUID(), version: 0, data: { kind: "pantry", title: "Garlic" } }, db);
    expect((await groceries()).find(row => row.id === rice.id)?.data).toMatchObject({ quantity: 200, checked: true });
    expect((await groceries()).find(row => row.data.title === "garlic")?.data).toMatchObject({ quantity: 2 });
    expect((await groceries()).some(row => row.id === manualId)).toBe(true); await w.checkpoint(4);

    w.day(5);
    expect((await rows()).filter(isFood)).toHaveLength(0);
    const food: Extract<LifeItem, { kind: "food" }> = { kind: "food", title: "Actual rice portion", date: "2027-01-15", meal: "Dinner", calories: 200, protein: 4, carbs: 40, fat: 1, fiber: null, source: "manual", amount: 100, unit: "g" };
    const foodId = randomUUID(); await mutateWorkspace(person.id, { action: "save", id: foodId, version: 0, data: food }, db);
    const totals = nutritionTotals((await rows()).filter(isFood));
    expect(totals.calories).toEqual({ value: 200, missing: 0 }); expect(totals.fiber).toEqual({ value: null, missing: 1 });
    expect((await rows()).filter(row => row.data.kind === "meal")).toHaveLength(1); await w.checkpoint(5);

    w.day(6);
    const copyId = randomUUID(); await mutateWorkspace(person.id, { action: "save", id: copyId, version: 0, data: repeatFood(food, "2027-01-16", "Lunch", 0.5) }, db);
    const stale = await item(copyId);
    await w.turn("Correct the copied rice portion calories to 120", [{ type: "life_list", kind: "food", id: copyId }, { type: "life_patch", id: copyId, version: stale.version, patch: { kind: "food", calories: 120, title: "Corrected rice portion" } }], { channel: "web" });
    expect((await item(copyId)).data).toMatchObject({ calories: 120, protein: 2, fiber: null, amount: 50, date: "2027-01-16" });
    await expect(mutateWorkspace(person.id, { action: "patch", id: copyId, version: stale.version, patch: { kind: "food", calories: 999 } }, db)).rejects.toThrow("changed");
    await expect(mutateWorkspace(w.outsider.id, { action: "patch", id: copyId, version: stale.version + 1, patch: { kind: "food", calories: 999 } }, db)).rejects.toThrow("unavailable"); await w.checkpoint(6);

    w.day(7);
    const older = await readWorkspace(person.id, db, { diaryDate: "2027-01-15" });
    expect(older.items.find(row => row.id === foodId)?.data).toMatchObject({ calories: 200, date: "2027-01-15", fiber: null });
    const retrieval = await w.turn("Show the current corrected rice portion saved in my foods", [{ type: "life_list", kind: "food", id: copyId }], { readOnly: true });
    expect(retrieval.toolTrace?.[0].result).toContain("Corrected rice portion"); expect(retrieval.toolTrace?.[0].result).toContain('"calories":120');
    expect((await person.workspace()).calendar).toBeNull();
    expect((await rows()).filter(isFood)).toHaveLength(2);
    expect((await rows()).filter(row => row.data.kind === "pantry")).toHaveLength(2);
    await w.checkpoint(7); expect(w.checkpoints).toEqual([1, 2, 3, 4, 5, 6, 7]);
  } finally { await w.close(); }
}, 30_000);


it("Priya: seven scripted days preserve local routine progress, reminder gates, STOP and returning-account state", async () => {
  const w = await firstWeek(); const { simulator: sim, person } = w; const db = sim.database;
  const routineId = randomUUID(), stepIds = [randomUUID(), randomUUID(), randomUUID()];
  const routine: Extract<LifeItem, { kind: "routine" }> = { kind: "routine", title: "Morning reset", period: "morning", time: "09:00", steps: stepIds.map((id, index) => ({ id, title: ["Water", "Stretch", "Choose a step"][index], minutes: 2, completedOn: null })) };
  try {
    await db.update(schema.users).set({ timezone: "UTC" }).where(eq(schema.users.id, person.id));
    expect((await person.workspace()).timezone).toBe("UTC");
    await saveGentleSetup(person.id, { action: "timezone", timezone: "America/New_York" }, db);
    await mutateWorkspace(person.id, { action: "save", id: routineId, version: 0, data: routine }, db);
    await mutateWorkspace(person.id, { action: "save", id: routineId, version: 1, data: { ...routine, steps: routine.steps.map((step, index) => index === 0 ? { ...step, completedOn: "2027-01-11" } : step) } }, db);
    const first = await w.checkpoint(1); expect(first.setup.timezoneConfirmedAt).toBeDefined(); expect(first.activityStreak.completedToday).toBe(1);

    w.day(2);
    await w.turn("Reorder my morning routine: choose a step, water, then stretch", [{ type: "life_list", kind: "routine", id: routineId }, { type: "life_patch", id: routineId, version: 2, patch: { kind: "routine", stepChanges: [{ operation: "reorder", stepIds: [stepIds[2], stepIds[0], stepIds[1]] }] } }]);
    let saved = await person.workspace(); const current = saved.items.find(row => row.id === routineId)!;
    expect(current.data).toMatchObject({ steps: [{ id: stepIds[2] }, { id: stepIds[0], completedOn: "2027-01-11" }, { id: stepIds[1] }] });
    if (current.data.kind !== "routine") throw new Error("Missing routine fixture");
    expect(current.data.steps.filter(step => step.completedOn === localDay(new Date(), saved.timezone))).toHaveLength(0);
    expect(saved.activityStreak.completedToday).toBe(0);
    const reminderTurn = await w.turn("Remind me every weekday at 9 AM to do morning reset", [{ type: "create_reminder", text: "Morning reset", recurrence: "weekdays", remindAt: "2027-01-13T09:00:00-05:00" }]);
    await person.send("Remind me every weekday at 9 AM to do morning reset", { providerId: reminderTurn.providerId });
    saved = await w.checkpoint(2); const reminder = saved.reminders[0]; expect(reminder).toMatchObject({ recurrence: "weekdays", timezone: "America/New_York" });

    w.day(3, "14:00:00"); await w.deliver(reminder.id);
    expect((await person.workspace()).reminders[0].remindAt.toISOString()).toBe("2027-01-14T14:00:00.000Z");
    await w.turn("Unrelated question about dinner", [], { channel: "web", readOnly: true });
    await w.turn("Snooze my morning reset reminder until 3 PM today", [{ type: "list_reminders" }, { type: "reschedule_reminder", reminderId: reminder.id, remindAt: "2027-01-13T15:00:00-05:00" }]);
    expect((await person.workspace()).reminders[0]).toMatchObject({ id: reminder.id, recurrence: "weekdays", remindAt: new Date("2027-01-13T20:00:00Z") });
    await w.turn("Mark my morning reset reminder done", [{ type: "complete_reminder", reminderId: reminder.id }]);
    saved = await w.checkpoint(3); expect(saved.reminders[0].status).toBe("completed");

    w.day(4);
    await mutateWorkspace(person.id, { action: "remove_reminder", id: reminder.id }, db);
    await w.turn("Remind me Friday January 15 at noon to review my routine", [{ type: "create_reminder", text: "Review routine", remindAt: "2027-01-15T12:00:00-05:00" }]);
    const explicit = (await person.workspace()).reminders.find(row => row.status === "scheduled")!;
    await mutateWorkspace(person.id, { action: "checkins", enabled: false }, db);
    const signals: ContextSignals = { userId: person.id, status: "active", onboardingComplete: true, hasConsent: true, proactiveOptIn: true, timezone: "America/New_York", quietHoursStart: "22:00", quietHoursEnd: "07:00", calendarBusy: false, calendarAvailable: true, freeMinutes: 120, dailyInterventionCount: 0, dailyInterventionCap: 3, minutesSinceLastIntervention: 1500, interventionCooldownMinutes: 240, hasPendingResponse: false, responseRate: 0.8, coachingTone: "gentle", repeatedNonStarts: 0, bodyDoublingAffinity: false, tasks: [{ id: randomUUID(), title: "One step", status: "not_started", dueAt: new Date("2027-01-14T18:00:00Z"), estimatedMinutes: 5, createdAt: new Date() }] };
    const [calendar] = await db.insert(schema.calendarConnections).values({ userId: person.id, lastSyncedAt: new Date() }).returning();
    await db.insert(schema.calendarBusyWindows).values({ userId: person.id, connectionId: calendar.id, startsAt: new Date("2027-01-14T14:30:00Z"), endsAt: new Date("2027-01-14T15:30:00Z"), sourceHash: "synthetic-week-busy" });
    expect((await new DrizzleContextEngineRepository(db).loadSignals(person.id, new Date()))?.calendarBusy).toBe(true);
    const policy = { id: "synthetic-week", ...DEFAULT_CONTEXT_POLICY, holdoutBasisPoints: 0 };
    expect(evaluateContext({ signals, policy, now: new Date("2027-01-14T11:59:59Z"), shadowMode: false }).reasonCodes).toContain("quiet_hours");
    expect(evaluateContext({ signals, policy, now: new Date("2027-01-14T12:00:00Z"), shadowMode: false }).reasonCodes).not.toContain("quiet_hours");
    expect(evaluateContext({ signals: { ...signals, calendarBusy: true }, policy, now: new Date(), shadowMode: false }).reasonCodes).toContain("calendar_busy");
    saved = await w.checkpoint(4); expect(saved.reminders.find(row => row.id === explicit.id)?.status).toBe("scheduled"); expect((await person.state()).user.proactiveOptIn).toBe(false);

    w.day(5);
    const state = await person.state(), phone = state.user.phoneE164;
    const ingress = (body: string) => ({ provider: "sendblue" as const, providerMessageId: randomUUID(), from: phone, to: "+12025550100", body });
    const repository = new DrizzleMessagingRepository(db);
    await repository.ingestInbound(ingress("STOP"));
    await repository.ingestInbound(ingress("leave me alone"));
    await recordWebConsent(new DrizzleConsentRepository(db), { countryCode: "US", callingCode: "+1", areaCode: "202", subscriberNumber: phone.slice(-7), consent: true }, { auditKey: "synthetic-week-audit" });
    const invited = new DrizzleMessagingRepository(db, { PILOT_ADMISSION_MODE: "invite_only", PILOT_INVITED_PHONES: [phone] });
    await invited.ingestInbound(ingress("back off"));
    expect((await person.state()).user).toMatchObject({ status: "opted_out", optedOutAt: expect.any(Date) });
    const pending = await db.select().from(schema.scheduledActions).where(and(eq(schema.scheduledActions.userId, person.id), eq(schema.scheduledActions.status, "scheduled")));
    expect(pending.filter(row => ["send_welcome", "process_inbound_message", "deliver_intervention", "evaluate_context"].includes(row.kind))).toHaveLength(0);
    await w.checkpoint(5);

    w.day(6);
    await invited.ingestInbound(ingress("START")); expect((await person.state()).user.status).toBe("active");
    const sessions = new WebSessionService(db), session = await sessions.create(person.id, new Date(), true);
    expect(await sessions.findAccount(session.token)).toMatchObject({ userId: person.id, phoneVerified: true });
    await saveGentleSetup(person.id, { action: "save", showStreak: false }, db);
    await w.turn("Remember this fact: my keys are in the red bowl", [{ type: "remember_memory", content: "Keys are in the red bowl", category: "fact" }]);
    const allMemories = (await person.state()).memories;
    const memory = allMemories.find(row => row.content.includes("red bowl"))!;
    expect(memory).toBeDefined();
    const messagesBefore = (await person.workspace()).messages.length;
    await mutateWorkspace(person.id, { action: "forget_memory", id: memory.id, expectedContent: memory.content }, db);
    saved = await w.checkpoint(6); expect(saved.setup.showStreak).toBe(false); expect(saved.memories?.some(row => row.id === memory.id)).toBe(false); expect(saved.memories).toHaveLength(allMemories.length - 1); expect(saved.messages.length).toBe(messagesBefore);

    w.day(7);
    const planId = randomUUID(), workoutTask = randomUUID();
    await mutateWorkspace(person.id, { action: "save", id: planId, version: 0, data: { kind: "workout_plan", title: "Small movement", templateId: "synthetic-walk", sessions: [{ name: "Walk", minutes: 5, exercises: [{ name: "Walk", dose: "5 minutes" }] }] } }, db);
    await mutateWorkspace(person.id, { action: "task", requestId: workoutTask, command: { type: "create_task", title: "Walk session", dueAt: "2027-01-17T12:00:00-05:00" } }, db);
    await mutateWorkspace(person.id, { action: "save", id: randomUUID(), version: 0, data: { kind: "workout", title: "Actual walk", date: "2027-01-17", minutes: 5, activity: "Walk", programId: planId, sessionName: "Walk" } }, db);
    saved = await w.checkpoint(7); expect(saved.tasks.find(row => row.title === "Walk session")?.status).toBe("not_started");
    expect(saved.items.find(row => row.id === routineId)?.data).toMatchObject({ steps: [{ id: stepIds[2] }, { id: stepIds[0], completedOn: "2027-01-11" }, { id: stepIds[1] }] });
    expect(saved.items.some(row => row.data.kind === "workout")).toBe(true); expect(w.checkpoints).toEqual([1, 2, 3, 4, 5, 6, 7]);
  } finally { await w.close(); }
}, 30_000);

