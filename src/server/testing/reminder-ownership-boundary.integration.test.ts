import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { createAssistantSimulator } from "../../../scripts/lib/assistant-simulator";
import type { CoachingCommand, TaskIntentParser } from "../adapters/llm/task-intent-parser";
import type { TempoDatabase } from "../db/client";
import { DrizzleConversationRepository } from "../db/repositories/conversation-repository";
import { DrizzleTaskRepository } from "../db/repositories/task-repository";
import { DrizzleGoalRepository } from "../db/repositories/goal-repository";
import { DrizzleSchedulingRepository } from "../db/repositories/scheduling-repository";
import { DrizzleMemoryRepository } from "../db/repositories/memory-repository";
import { mutateWorkspace } from "../db/repositories/workspace-repository";
import { conversationMessages, memoryEntries } from "../db/schema";
import type { AssistantIntegrations } from "../domain/assistant-commands";
import { ConversationOrchestrator, type InboundConversationContext } from "../domain/conversation-orchestrator";
import { InboundOwnershipLostError } from "../domain/inbound-execution";
import { MemoryService } from "../domain/memory-service";
import { WRITE_COMMANDS } from "../domain/turn-write-policy";

it("orders local command and reply writes account-first without holding the account lock across provider awaits", async () => {
  let active = 0, lockedOperations = 0;
  let commandLocked = false;
  let command: CoachingCommand = { type: "create_reminder", text: "Studio plan", remindAt: "2027-01-12T17:00:00Z" };
  const original = DrizzleConversationRepository.prototype.withOwnership;
  const ownership = vi.spyOn(DrizzleConversationRepository.prototype, "withOwnership").mockImplementation(async function<T>(
    this: DrizzleConversationRepository, context: InboundConversationContext, operation: () => Promise<T>, options?: { accountFirst?: boolean },
  ): Promise<T> {
    return original.call(this, context, async () => {
      if (!options?.accountFirst) return operation();
      active++; lockedOperations++;
      try { return await operation(); } finally { active--; }
    }, options) as Promise<T>;
  });
  const simulation = await createAssistantSimulator({
    authorizer: { authorize: async () => {
      expect(active).toBe(0);
      return { mode: "write", commands: WRITE_COMMANDS.filter(type => type === command.type) };
    } },
    parse: async input => {
      expect(active).toBe(0);
      const previous = lockedOperations;
      const reply = await input.execute!(command);
      commandLocked = lockedOperations > previous;
      expect(active).toBe(0);
      return { kind: "conversation", reply };
    },
  });
  const transportSend = simulation.transport.send.bind(simulation.transport);
  const send = vi.spyOn(simulation.transport, "send");
  send.mockImplementation(async request => { expect(active).toBe(0); return transportSend(request); });
  simulation.setTime(new Date("2027-01-11T15:00:00Z"));
  try {
    const person = await simulation.user();
    await person.send("Remind me about the studio plan tomorrow at noon");
    expect((await person.state()).reminders).toHaveLength(1);
    expect(commandLocked).toBe(true);
    expect(lockedOperations).toBeGreaterThan(1);
    const reminderId = (await person.state()).reminders[0].id;
    command = { type: "reschedule_reminder", reminderId, remindAt: "2027-01-13T17:00:00Z" };
    await person.send("Move my studio reminder to Wednesday at noon");
    expect((await person.state()).reminders[0].remindAt.toISOString()).toBe("2027-01-13T17:00:00.000Z");
    expect(commandLocked).toBe(true);
    command = { type: "list_reminders" };
    await person.send("Which reminders are saved?");
    expect(commandLocked).toBe(false);
    command = { type: "create_task", title: "Review studio ideas" };
    expect((await person.send("Could you put review studio ideas on my task list?")).parserCalled).toBe(true);
    expect((await person.state()).tasks).toHaveLength(1);
    expect(commandLocked).toBe(true);
    command = { type: "life_save", data: { kind: "note", title: "Studio paint", body: "Light blue." } };
    await person.send("Save a note about studio paint");
    expect((await person.state()).lifeItems).toHaveLength(1);
    expect(commandLocked).toBe(true);
    command = { type: "life_list", kind: "note" };
    await person.send("Show my saved notes");
    expect(commandLocked).toBe(false);
    command = { type: "life_list", kind: "grocery" };
    await person.send("Show my grocery list");
    expect(commandLocked).toBe(true);
    command = { type: "calendar_change", change: { operation: "create", title: "Studio time", start: "2027-01-13T17:00:00Z", end: "2027-01-13T18:00:00Z" } };
    await person.send("Add studio time to my calendar Wednesday at noon");
    expect(commandLocked).toBe(true);
    expect(send).toHaveBeenCalled();
  } finally { await simulation.close(); ownership.mockRestore(); }
}, 30_000);

const now = new Date("2027-01-11T15:00:00Z");

class ObservedOwnershipRepository extends DrizzleConversationRepository {
  accountLocks = 0;
  sourceLocks = 0;
  override withOwnership<T>(context: InboundConversationContext, operation: () => Promise<T>, options?: { accountFirst?: boolean }) {
    return super.withOwnership(context, async () => {
      this.sourceLocks++;
      if (options?.accountFirst) this.accountLocks++;
      try { return await operation(); }
      finally {
        this.sourceLocks--;
        if (options?.accountFirst) this.accountLocks--;
      }
    }, options);
  }
}

function localCoach(database: TempoDatabase, repository: DrizzleConversationRepository, parser: TaskIntentParser, integrations?: AssistantIntegrations) {
  const send = vi.fn();
  const coach = new ConversationOrchestrator(repository, new DrizzleTaskRepository(database), new DrizzleGoalRepository(database),
    new DrizzleSchedulingRepository(database), parser, { send }, () => now, undefined,
    new MemoryService(new DrizzleMemoryRepository(database)), undefined, undefined, undefined, integrations);
  return { coach, send };
}

async function queueWebTurn(database: TempoDatabase, userId: string, text: string) {
  const requestId = randomUUID();
  await mutateWorkspace(userId, { action: "chat", requestId, text }, database);
  return (await database.select().from(conversationMessages).where(eq(conversationMessages.idempotencyKey, `web-chat:${userId}:${requestId}`)))[0].id;
}

it.each(["takeover", "abort"])("rejects a memory authorization that returns after %s", async mode => {
  const simulation = await createAssistantSimulator({ parse: async () => ({ kind: "conversation", reply: "Unused." }) });
  const { database } = simulation;
  const repository = new ObservedOwnershipRepository(database);
  const controller = new AbortController();
  let entered!: () => void;
  let resume!: () => void;
  const requested = new Promise<void>(resolve => { entered = resolve; });
  const hold = new Promise<void>(resolve => { resume = resolve; });
  try {
    const person = await simulation.user();
    const sourceId = await queueWebTurn(database, person.id, "Remember that the studio is on Oak Street");
    const { coach, send } = localCoach(database, repository, {
      authorizer: { authorize: async () => {
        expect(repository.sourceLocks).toBe(0);
        expect(repository.accountLocks).toBe(0);
        entered();
        await hold;
        return { mode: "write", commands: ["remember_memory"] };
      } },
      parse: async () => { throw new Error("Shortcut should stop before parsing"); },
    });
    const turn = coach.process(sourceId, controller.signal);
    const settled = Promise.allSettled([turn]);
    await Promise.race([requested, turn.then(() => { throw new Error("Expected memory authorization"); })]);
    let replacement: InboundConversationContext | null = null;
    if (mode === "takeover") {
      replacement = await repository.claimInbound(sourceId, new Date(now.getTime() + 6 * 60_000));
      expect(replacement).not.toBeNull();
    } else controller.abort(new Error("Synthetic cancellation"));
    resume();
    const [outcome] = await settled;
    expect(outcome).toMatchObject({ status: "rejected", reason: mode === "takeover" ? expect.any(InboundOwnershipLostError) : expect.objectContaining({ message: "Synthetic cancellation" }) });
    expect(send).not.toHaveBeenCalled();
    expect(await database.select().from(memoryEntries).where(eq(memoryEntries.userId, person.id))).toHaveLength(0);
    const [source] = await database.select().from(conversationMessages).where(eq(conversationMessages.id, sourceId));
    expect(source).toMatchObject({ replyBody: null, processingToken: replacement?.processingToken ?? null });
  } finally { resume(); await simulation.close(); }
}, 30_000);

it("awaits Google outside the account lock and keeps a replacement pending confirmation", async () => {
  const simulation = await createAssistantSimulator({ parse: async () => ({ kind: "conversation", reply: "Unused." }) });
  const { database } = simulation;
  const repository = new ObservedOwnershipRepository(database);
  const replacement = { entity: "calendar_confirmation" as const, createdByMessageId: randomUUID(), token: "replacement", summary: "Confirm another event?", expiresAt: new Date(now.getTime() + 60_000) };
  try {
    const person = await simulation.user();
    const proposal = { token: "original", summary: "Confirm studio time?" };
    const proposeCalendarChange = vi.fn(async () => {
      expect(repository.accountLocks).toBe(0);
      expect(repository.sourceLocks).toBeGreaterThan(0);
      return proposal;
    });
    const confirmCalendarChange = vi.fn(async (userId: string, token: string) => {
      expect(repository.accountLocks).toBe(0);
      expect(repository.sourceLocks).toBeGreaterThan(0);
      expect(token).toBe(proposal.token);
      await repository.savePendingAction(userId, replacement);
      return "Calendar changed.";
    });
    const { coach, send } = localCoach(database, repository, {
      authorizer: { authorize: async () => ({ mode: "write", commands: ["calendar_change"] }) },
      parse: async () => ({ kind: "command", command: { type: "calendar_change", change: { operation: "create", title: "Studio time", start: "2027-01-13T17:00:00Z", end: "2027-01-13T18:00:00Z" } } }),
    }, { proposeCalendarChange, confirmCalendarChange, status: async () => "Connected.", agenda: async () => "{}", setCheckins: async () => "Unused." });
    await coach.process(await queueWebTurn(database, person.id, "Add studio time to my calendar Wednesday at noon"));
    expect(proposeCalendarChange).toHaveBeenCalledOnce();
    expect(await repository.getPendingAction(person.id)).toMatchObject(proposal);
    await coach.process(await queueWebTurn(database, person.id, "YES"));
    expect(confirmCalendarChange).toHaveBeenCalledOnce();
    expect(await repository.getPendingAction(person.id)).toEqual(replacement);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ body: "Calendar changed." }));
  } finally { await simulation.close(); }
}, 30_000);
