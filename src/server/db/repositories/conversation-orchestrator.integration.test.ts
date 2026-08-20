import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TaskIntentParser } from "../../adapters/llm/task-intent-parser";
import { TestSmsTransport } from "../../adapters/sms/sms-transport";
import { ConversationOrchestrator } from "../../domain/conversation-orchestrator";
import { SafeSmsSender } from "../../domain/outbound-messaging";
import { MemoryService } from "../../domain/memory-service";
import { TempoDatabase } from "../client";
import * as schema from "../schema";
import {
  calendarBusyWindows,
  calendarConnections,
  consentRecords,
  conversationMessages,
  goalEvents,
  goals,
  memoryEntries,
  taskEvents,
  tasks,
  users,
} from "../schema";
import { DrizzleConversationRepository } from "./conversation-repository";
import { DrizzleGoalRepository } from "./goal-repository";
import { DrizzleMemoryRepository } from "./memory-repository";
import { DrizzleSchedulingRepository } from "./scheduling-repository";
import { DrizzleOutboundMessageRepository } from "./outbound-message-repository";
import { DrizzleTaskRepository } from "./task-repository";

describe("inbound conversation orchestration", () => {
  let client: PGlite;
  let database: TempoDatabase;

  beforeAll(async () => {
    client = new PGlite();
    for (const file of (await readdir(resolve(process.cwd(), "drizzle"))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      const migration = (await readFile(resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll(
        "--> statement-breakpoint",
        "",
      );
      await client.exec(migration);
    }
    database = drizzle(client, { schema }) as unknown as TempoDatabase;
  });

  afterAll(async () => {
    await client.close();
  });

  async function consentedUser(phoneE164: string, onboardingState: "introduction" | "complete") {
    const [user] = await database.insert(users).values({ phoneE164, onboardingState }).returning();
    await database.insert(consentRecords).values({
      userId: user.id,
      status: "granted",
      channel: "sms",
      disclosureVersion: "test",
      termsVersion: "test",
      privacyVersion: "test",
    });
    return user;
  }

  function orchestrator(transport: TestSmsTransport, parser?: TaskIntentParser) {
    return new ConversationOrchestrator(
      new DrizzleConversationRepository(database),
      new DrizzleTaskRepository(database),
      new DrizzleGoalRepository(database),
      new DrizzleSchedulingRepository(database),
      parser ?? { parse: vi.fn(async () => ({ kind: "conversation" as const, reply: "Tell me more." })) },
      new SafeSmsSender(new DrizzleOutboundMessageRepository(database), transport),
      () => new Date("2026-08-18T12:00:00Z"),
      undefined,
      new MemoryService(new DrizzleMemoryRepository(database)),
    );
  }

  it("accepts the quick contact choice and advances to calendar", async () => {
    const user = await consentedUser("+12025550198", "introduction");
    const [message] = await database
      .insert(conversationMessages)
      .values({
        userId: user.id,
        direction: "inbound",
        kind: "user",
        status: "received",
        body: "DONE",
      })
      .returning();
    const transport = new TestSmsTransport("ONBOARD");

    expect(await orchestrator(transport).process(message.id)).toEqual({ processed: true });

    const [updatedUser] = await database.select().from(users).where(eq(users.id, user.id));
    const createdTasks = await database.select().from(tasks).where(eq(tasks.userId, user.id));
    expect(updatedUser.onboardingState).toBe("calendar");
    expect(createdTasks).toHaveLength(0);
    expect(transport.sent[0].body).toContain("One last setup step");
  });

  it("asks for clarification, applies the selected task, and ignores a job retry", async () => {
    const user = await consentedUser("+14155550132", "complete");
    const setupMessages = await database
      .insert(conversationMessages)
      .values([
        { userId: user.id, direction: "inbound", kind: "user", status: "processed", body: "Add report" },
        { userId: user.id, direction: "inbound", kind: "user", status: "processed", body: "Add budget" },
      ])
      .returning();
    const taskRepository = new DrizzleTaskRepository(database);
    await taskRepository.create({ userId: user.id, sourceMessageId: setupMessages[0].id, title: "Finish Q3 report" });
    const budget = await taskRepository.create({ userId: user.id, sourceMessageId: setupMessages[1].id, title: "Review Q3 budget" });

    const [ambiguousMessage] = await database
      .insert(conversationMessages)
      .values({ userId: user.id, direction: "inbound", kind: "user", status: "received", body: "done with Q3" })
      .returning();
    const transport = new TestSmsTransport("TASKFLOW");
    const intentParser: TaskIntentParser = {
      parse: vi.fn(async () => ({ kind: "conversation" as const, reply: "unused" })),
    };
    const coach = orchestrator(transport, intentParser);

    await coach.process(ambiguousMessage.id);
    expect(transport.sent[0].body).toContain("Which task did you mean?");
    expect(intentParser.parse).not.toHaveBeenCalled();

    const [choiceMessage] = await database
      .insert(conversationMessages)
      .values({ userId: user.id, direction: "inbound", kind: "user", status: "received", body: "budget" })
      .returning();
    expect(await coach.process(choiceMessage.id)).toEqual({ processed: true });
    expect(await coach.process(choiceMessage.id)).toEqual({ processed: false });

    const [completedBudget] = await database.select().from(tasks).where(eq(tasks.id, budget.id));
    const [completionEvent] = await database
      .select()
      .from(taskEvents)
      .where(and(eq(taskEvents.taskId, budget.id), eq(taskEvents.eventType, "completed")));
    expect(completedBudget.status).toBe("completed");
    expect(completionEvent.sourceMessageId).toBe(choiceMessage.id);
    expect(transport.sent).toHaveLength(2);
    expect(transport.sent[1].body).toBe("Done: Review Q3 budget.");
  });

  it("creates and completes a goal through SMS with a source-traced audit trail", async () => {
    const user = await consentedUser("+14155550131", "complete");
    const transport = new TestSmsTransport("GOALFLOW");
    const coach = orchestrator(transport);
    const [createMessage] = await database.insert(conversationMessages).values({
      userId: user.id, direction: "inbound", kind: "user", status: "received", body: "My goal is to run a half marathon",
    }).returning();
    await coach.process(createMessage.id);
    const [goal] = await database.select().from(goals).where(eq(goals.userId, user.id));
    expect(goal).toMatchObject({ title: "run a half marathon", status: "active", sourceMessageId: createMessage.id });

    const [completeMessage] = await database.insert(conversationMessages).values({
      userId: user.id, direction: "inbound", kind: "user", status: "received", body: "I achieved my goal run a half marathon",
    }).returning();
    await coach.process(completeMessage.id);
    const [completed] = await database.select().from(goals).where(eq(goals.id, goal.id));
    const events = await database.select().from(goalEvents).where(eq(goalEvents.goalId, goal.id));
    expect(completed.status).toBe("completed");
    expect(events.map((event) => [event.eventType, event.sourceMessageId])).toEqual([
      ["created", createMessage.id],
      ["completed", completeMessage.id],
    ]);
    expect(transport.sent.map((message) => message.body)).toEqual([
      "Goal added: run a half marathon.",
      "Goal achieved: run a half marathon.",
    ]);
  });

  it("injects limited active memory into the model boundary and records that it was referenced", async () => {
    const user = await consentedUser("+14155550130", "complete");
    const [memory] = await database.insert(memoryEntries).values({
      userId: user.id,
      category: "preference",
      content: "The user prefers gentle, one-step prompts.",
      confidence: 1,
    }).returning();
    await database.insert(memoryEntries).values({
      userId: user.id,
      category: "fact",
      content: "This expired memory must not be injected.",
      expiresAt: new Date("2026-08-17T12:00:00Z"),
    });
    const [message] = await database.insert(conversationMessages).values({
      userId: user.id, direction: "inbound", kind: "user", status: "received", body: "What should I do next?",
    }).returning();
    const parser: TaskIntentParser = {
      parse: vi.fn(async () => ({ kind: "conversation" as const, reply: "Choose one two-minute step." })),
    };
    await orchestrator(new TestSmsTransport("MEMORY"), parser).process(message.id);
    expect(parser.parse).toHaveBeenCalledWith(expect.objectContaining({
      memories: ["The user prefers gentle, one-step prompts."],
      openGoals: [],
    }));
    const [referenced] = await database.select().from(memoryEntries).where(eq(memoryEntries.id, memory.id));
    expect(referenced.lastReferencedAt).toEqual(new Date("2026-08-18T12:00:00Z"));
  });

  it("stores an explicit pattern memory once and traces it to the user's message", async () => {
    const user = await consentedUser("+14155550129", "complete");
    const [message] = await database.insert(conversationMessages).values({
      userId: user.id,
      direction: "inbound",
      kind: "user",
      status: "received",
      body: "Remember that I usually focus best before lunch",
    }).returning();
    const transport = new TestSmsTransport("REMEMBER");
    const coach = orchestrator(transport);
    expect(await coach.process(message.id)).toEqual({ processed: true });
    expect(await coach.process(message.id)).toEqual({ processed: false });
    const stored = await database.select().from(memoryEntries).where(eq(memoryEntries.sourceMessageId, message.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      category: "pattern",
      content: "The user said: I usually focus best before lunch.",
      confidence: 1,
    });
    expect(transport.sent[0].body).toContain("remember that");
  });

  it("proposes a concrete fresh-calendar slot and updates the task only after confirmation", async () => {
    const user = await consentedUser("+14155550128", "complete");
    await database.update(users).set({
      timezone: "America/New_York",
      quietHoursStart: "23:00:00",
      quietHoursEnd: "07:00:00",
    }).where(eq(users.id, user.id));
    const setupMessages = await database.insert(conversationMessages).values([
      { userId: user.id, direction: "inbound", kind: "user", status: "processed", body: "Add report" },
      { userId: user.id, direction: "inbound", kind: "user", status: "received", body: "I can't do Write report today" },
      { userId: user.id, direction: "inbound", kind: "user", status: "received", body: "YES" },
    ]).returning();
    const task = await new DrizzleTaskRepository(database).create({
      userId: user.id,
      sourceMessageId: setupMessages[0].id,
      title: "Write report",
      estimatedMinutes: 30,
      dueAt: new Date("2026-08-18T20:00:00Z"),
    });
    const [connection] = await database.insert(calendarConnections).values({
      userId: user.id,
      status: "active",
      lastSyncedAt: new Date("2026-08-18T12:00:00Z"),
    }).returning();
    await database.insert(calendarBusyWindows).values({
      userId: user.id,
      connectionId: connection.id,
      startsAt: new Date("2026-08-19T11:00:00Z"),
      endsAt: new Date("2026-08-19T12:00:00Z"),
      sourceHash: "reschedule-busy-window",
      syncedAt: new Date("2026-08-18T12:00:00Z"),
    });
    const transport = new TestSmsTransport("RESCHEDULE");
    const coach = orchestrator(transport);
    await coach.process(setupMessages[1].id);
    const beforeConfirmation = (await database.select().from(tasks).where(eq(tasks.id, task.id)))[0];
    expect(beforeConfirmation.dueAt).toEqual(new Date("2026-08-18T20:00:00Z"));
    expect(transport.sent[0].body).toContain("Wed, Aug 19, 8:00 AM");
    await coach.process(setupMessages[2].id);
    const confirmed = (await database.select().from(tasks).where(eq(tasks.id, task.id)))[0];
    expect(confirmed.dueAt).toEqual(new Date("2026-08-19T12:00:00Z"));
    const [event] = await database.select().from(taskEvents).where(eq(taskEvents.sourceMessageId, setupMessages[2].id));
    expect(event).toMatchObject({ taskId: task.id, eventType: "updated" });
  });
});
