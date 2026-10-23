import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { firstWeek } from "./first-week-fixtures";
import { DrizzleReminderRepository } from "../db/repositories/reminder-repository";
import { executeReminderCommand } from "../domain/reminder-service";
import * as schema from "../db/schema";

async function fixture() {
  const w = await firstWeek(); const db = w.simulator.database;
  const repository = new DrizzleReminderRepository(db);
  const source = async (body = "Explicit synthetic reminder follow-up") => {
    const turn = await w.turn(body);
    return (await db.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.providerMessageSid, turn.providerId)))[0].id;
  };
  const [task] = await db.insert(schema.tasks).values({ userId: w.person.id, title: "Studio plan" }).returning();
  const original = await repository.create({ userId: w.person.id, sourceMessageId: await source(), timezone: "America/New_York", text: "Outline studio plan", taskId: task.id, remindAt: new Date("2027-01-11T16:00:00Z") });
  w.day(1, "16:00:00"); await w.deliver(original.id);
  const before = (await w.person.state()).reminders[0];
  const history = await db.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.relatedReminderId, original.id));
  return { w, db, repository, original, before, history, source };
}

it("atomically creates one linked follow-up after delivery and preserves its original record, message and reply target", async () => {
  const f = await fixture(); const { w, db, repository, original, source } = f;
  try {
    const sourceMessageId = await source("Move my delivered studio reminder to tomorrow at noon");
    const input = { userId: w.person.id, sourceMessageId, reminderId: original.id, remindAt: new Date("2027-01-12T17:00:00Z"), now: new Date() };
    const results = await Promise.all([repository.update(input), repository.update(input)]);
    expect(results.every(result => result.kind === "followup")).toBe(true);
    if (results[0].kind !== "followup") throw new Error("Expected follow-up");
    const followup = results[0].reminder;
    expect(followup.id).not.toBe(original.id);
    expect(results[1]).toMatchObject({ kind: "followup", originalReminderId: original.id, reminder: { id: followup.id } });
    expect((await w.person.state()).reminders).toHaveLength(2);
    expect((await w.person.state()).reminders.find(row => row.id === original.id)).toEqual(f.before);
    expect((await w.person.state()).reminders.find(row => row.id === followup.id)).toMatchObject({ taskId: f.before.taskId, recurrence: null, timezone: "America/New_York", status: "scheduled", sourceMessageId });
    expect(await db.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.relatedReminderId, original.id))).toEqual(f.history);
    const jobs = await db.select().from(schema.scheduledActions).where(and(eq(schema.scheduledActions.reminderId, followup.id), eq(schema.scheduledActions.status, "scheduled")));
    expect(jobs).toHaveLength(1); expect(jobs[0].payload).toMatchObject({ followsReminderId: original.id, reminderId: followup.id });
    expect(await repository.update({ ...input, remindAt: new Date("2027-01-12T18:00:00Z") })).toMatchObject({ kind: "conflict" });
    const explanation = await executeReminderCommand(repository, { type: "reschedule_reminder", reminderId: original.id, remindAt: input.remindAt.toISOString() }, { ...input, timezone: "UTC" });
    expect(explanation).toContain("original reminder was already delivered"); expect(explanation).toContain("new reminder was saved"); expect(explanation).toContain("12:00 PM EST");
    w.day(2, "17:00:00"); await w.deliver(followup.id);
    const message = (await db.select().from(schema.conversationMessages).where(eq(schema.conversationMessages.relatedReminderId, followup.id)))[0];
    expect(message.relatedReminderId).toBe(followup.id); expect(message.id).not.toBe(f.history[0].id);
    expect((await w.person.state()).reminders.find(row => row.id === original.id)).toEqual(f.before);
    // A trimmed completed job cannot remove the independent provenance receipt.
    await db.delete(schema.scheduledActions).where(eq(schema.scheduledActions.id, jobs[0].id));
    expect(await repository.update(input)).toMatchObject({ kind: "followup", reminder: { id: followup.id } });
    expect(await db.select().from(schema.lifeActionReceipts).where(eq(schema.lifeActionReceipts.key, `reminder-followup:${w.person.id}:${sourceMessageId}`))).toHaveLength(1);

  } finally { await w.close(); }
}, 30_000);

it.each(["opted_out", "paused", "paused_until", "deleted", "revoked", "missing_consent"])("never creates a delivered follow-up for an unavailable account: %s", async state => {
  const f = await fixture(); const { w, db, repository, source } = f;
  try {
    const sourceMessageId = await source();
    if (state === "missing_consent") await db.delete(schema.consentRecords).where(eq(schema.consentRecords.userId, w.person.id));
    else if (state === "paused_until") await db.update(schema.users).set({ pausedUntil: new Date(Date.now() + 3600000) }).where(eq(schema.users.id, w.person.id));
    else if (state === "revoked") await db.insert(schema.consentRecords).values({ userId: w.person.id, status: "revoked", channel: "sms", disclosureVersion: "synthetic", termsVersion: "synthetic", privacyVersion: "synthetic", createdAt: new Date(Date.now() + 1) });
    else await db.update(schema.users).set({ status: state as "opted_out" | "paused" | "deleted" }).where(eq(schema.users.id, w.person.id));
    expect(await repository.update({ userId: w.person.id, sourceMessageId, reminderId: f.original.id, remindAt: new Date("2027-01-12T17:00:00Z"), now: new Date() })).toMatchObject({ kind: "blocked" });
    expect((await w.person.state()).reminders).toEqual([f.before]);
    expect(await db.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.idempotencyKey, `reminder-update:${sourceMessageId}`))).toHaveLength(0);
  } finally { await w.close(); }
}, 30_000);

it("rejects foreign/invalid sources, past times, terminal cancellation/completion and sent recurring forks without writes", async () => {
  const f = await fixture(); const { w, db, repository, source } = f;
  try {
    const sourceMessageId = await source();
    const input = { userId: w.person.id, sourceMessageId, reminderId: f.original.id, remindAt: new Date("2027-01-12T17:00:00Z"), now: new Date() };
    expect(await repository.update({ ...input, userId: w.outsider.id })).toMatchObject({ kind: "not_found" });
    expect(await repository.update({ ...input, sourceMessageId: randomUUID() })).toMatchObject({ kind: "not_found" });
    expect(await repository.update({ ...input, remindAt: new Date(Date.now() - 1) })).toMatchObject({ kind: "not_found" });
    expect(await repository.update({ ...input, remindAt: new Date(NaN) })).toMatchObject({ kind: "not_found" });
    for (const status of ["cancelled", "completed", "sending"] as const) {
      await db.update(schema.reminders).set({ status }).where(eq(schema.reminders.id, f.original.id));
      expect(await repository.update(input)).toMatchObject({ kind: "not_found" });
    }
    await db.update(schema.reminders).set({ status: "sent", recurrence: "daily" }).where(eq(schema.reminders.id, f.original.id));
    expect(await repository.update(input)).toMatchObject({ kind: "not_found" });
    expect((await w.person.state()).reminders).toHaveLength(1);
    expect((await w.outsider.state()).reminders).toHaveLength(0);
    expect(await db.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.idempotencyKey, `reminder-update:${sourceMessageId}`))).toHaveLength(0);
  } finally { await w.close(); }
}, 30_000);

it("keeps mixed sent/pending batch edits atomic and does not create two follow-ups", async () => {
  const f = await fixture(); const { w, db, repository, source } = f;
  try {
    const pending = await repository.create({ userId: w.person.id, sourceMessageId: await source(), timezone: "America/New_York", text: "Other reminder", remindAt: new Date("2027-01-12T18:00:00Z") });
    const before = (await w.person.state()).reminders;
    const input = { userId: w.person.id, sourceMessageId: await source(), now: new Date(), changes: [f.original, pending].map(row => ({ reminderId: row.id, expectedRemindAt: row.remindAt, remindAt: new Date("2027-01-13T17:00:00Z") })) };
    const jobsBefore = await db.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.userId, w.person.id));
    expect(await repository.updateMany(input)).toEqual({ kind: "stale" }); expect(await repository.updateMany(input)).toEqual({ kind: "stale" });
    expect((await w.person.state()).reminders).toEqual(before);
    expect(await db.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.userId, w.person.id))).toEqual(jobsBefore);
  } finally { await w.close(); }
}, 30_000);


it("fails conflicting reuse of a create or pending-edit source cleanly without changing sent history or delivery jobs", async () => {
  const f = await fixture(); const { w, db, repository, source } = f;
  try {
    const createSource = await source();
    const pending = await repository.create({ userId: w.person.id, sourceMessageId: createSource, timezone: "America/New_York", text: "Separate pending reminder", remindAt: new Date("2027-01-12T18:00:00Z") });
    const update = { userId: w.person.id, sourceMessageId: createSource, reminderId: f.original.id, remindAt: new Date("2027-01-13T17:00:00Z"), now: new Date() };
    const before = (await w.person.state()).reminders;
    const beforeJobs = await db.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.userId, w.person.id));
    expect(await repository.update(update)).toEqual({ kind: "conflict" });
    expect((await w.person.state()).reminders).toEqual(before);
    expect(await db.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.userId, w.person.id))).toEqual(beforeJobs);
    const editSource = await source();
    const pendingEdit = { ...update, sourceMessageId: editSource, reminderId: pending.id };
    expect(await repository.update(pendingEdit)).toMatchObject({ kind: "updated", reminder: { id: pending.id } });
    const edited = (await w.person.state()).reminders;
    const editedJobs = await db.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.userId, w.person.id));
    expect(await repository.update({ ...update, sourceMessageId: editSource })).toEqual({ kind: "conflict" });
    expect(await repository.update({ ...pendingEdit, remindAt: new Date("2027-01-13T18:00:00Z") })).toEqual({ kind: "conflict" });
    expect((await w.person.state()).reminders).toEqual(edited);
    expect(await db.select().from(schema.scheduledActions).where(eq(schema.scheduledActions.userId, w.person.id))).toEqual(editedJobs);
  } finally { await w.close(); }
}, 30_000);
