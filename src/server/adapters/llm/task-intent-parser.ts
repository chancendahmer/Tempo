import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { requireEnv } from "../../config/env";
import { TaskCommand, TaskSummary, taskCommandSchema } from "../../domain/task-commands";
import { GoalCommand, GoalSummary, goalCommandSchema } from "../../domain/goal-commands";
import { RescheduleCommand, rescheduleCommandSchema } from "../../domain/reschedule-service";
import { ConversationHistoryMessage } from "../../domain/conversation-history";
import { isExplicitReminderRequest, ReminderCommand, reminderCommandSchema } from "../../domain/reminder-commands";
import { MemoryCommand, memoryCommandSchema } from "../../domain/memory-service";

export type CoachingCommand = TaskCommand | GoalCommand | RescheduleCommand | ReminderCommand | MemoryCommand;
export type TaskIntentResult = { kind: "command"; command: CoachingCommand } | { kind: "conversation"; reply: string };

export interface TaskIntentParser {
  parse(input: {
    message: string;
    timezone: string;
    now: Date;
    openTasks: TaskSummary[];
    openGoals: GoalSummary[];
    memories: string[];
    customInstructions?: string;
    history?: ConversationHistoryMessage[];
  }): Promise<TaskIntentResult>;
}

const referenceProperties = {
  taskId: { type: "string", format: "uuid", description: "Exact task ID when known." },
  taskQuery: { type: "string", description: "The user's title or phrase identifying the task." },
};

export const TASK_TOOLS: Tool[] = [
  {
    name: "create_task",
    description: "Create one concrete task the user has committed to doing.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        estimatedMinutes: { type: "integer", minimum: 1, maximum: 1440 },
        dueAt: { type: "string", format: "date-time", description: "ISO 8601 timestamp with an offset." },
        goalId: { type: "string", format: "uuid", description: "Exact active goal ID when this task belongs to a known goal." },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "list_tasks",
    description: "List the user's tasks.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string", enum: ["open", "completed", "all"] } },
      additionalProperties: false,
    },
  },
  ...(["start_task", "complete_task", "abandon_task"] as const).map(
    (name): Tool => ({
      name,
      description: `${name.replace("_", " ")} identified by ID or title. Never guess when multiple tasks match.`,
      input_schema: {
        type: "object",
        properties: referenceProperties,
        additionalProperties: false,
      },
    }),
  ),
  {
    name: "update_task",
    description: "Update the title, estimate, or due time of an existing task.",
    input_schema: {
      type: "object",
      properties: {
        ...referenceProperties,
        patch: {
          type: "object",
          properties: {
            title: { type: "string" },
            estimatedMinutes: { type: ["integer", "null"], minimum: 1, maximum: 1440 },
            dueAt: { type: ["string", "null"], format: "date-time" },
          },
          additionalProperties: false,
        },
      },
      required: ["patch"],
      additionalProperties: false,
    },
  },
  {
    name: "create_goal",
    description: "Create a durable larger outcome that may contain multiple tasks.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "list_goals",
    description: "List the user's goals.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string", enum: ["active", "completed", "all"] } },
      additionalProperties: false,
    },
  },
  ...(["complete_goal", "abandon_goal"] as const).map(
    (name): Tool => ({
      name,
      description: `${name.replace("_", " ")} identified by exact ID or title. Never guess when multiple goals match.`,
      input_schema: {
        type: "object",
        properties: {
          goalId: { type: "string", format: "uuid" },
          goalQuery: { type: "string" },
        },
        additionalProperties: false,
      },
    }),
  ),
  {
    name: "update_goal",
    description: "Update the title or description of an existing goal.",
    input_schema: {
      type: "object",
      properties: {
        goalId: { type: "string", format: "uuid" },
        goalQuery: { type: "string" },
        patch: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: ["string", "null"] },
          },
          additionalProperties: false,
        },
      },
      required: ["patch"],
      additionalProperties: false,
    },
  },
  {
    name: "reschedule_task",
    description: "Ask Tempo to propose a concrete new time for an existing task using fresh calendar availability.",
    input_schema: {
      type: "object",
      properties: {
        ...referenceProperties,
        afterToday: { type: "boolean", description: "True when the user explicitly cannot do the task today." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "create_reminder",
    description: "Schedule a one-time reminder at the exact date and time the user requested. Use this instead of create_task when the user explicitly says remind me, alert me, or text me at a time.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "What Tempo should remind the user about." },
        remindAt: { type: "string", format: "date-time", description: "Exact future ISO 8601 timestamp with an offset derived from the user's timezone." },
        recurrence: {
          type: "string",
          enum: ["daily", "weekdays", "weekly"],
          description: "Only set when the user explicitly requests a repeating daily, weekday, or weekly reminder.",
        },
        taskId: { type: "string", format: "uuid", description: "Optional exact related task ID when known." },
      },
      required: ["text", "remindAt"],
      additionalProperties: false,
    },
  },
  {
    name: "list_reminders",
    description: "List the user's upcoming one-time reminders.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "cancel_reminder",
    description: "Cancel an upcoming reminder by exact ID or a distinctive phrase from its description.",
    input_schema: {
      type: "object",
      properties: {
        reminderId: { type: "string", format: "uuid" },
        reminderQuery: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "remember_memory",
    description: "Persist a durable, non-sensitive fact, pattern, or preference only when the user explicitly asks Tempo to remember/log it, states a clear lasting preference for future help, or answers Tempo's direct question asking what to add to a memory list.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "A concise standalone statement, such as ‘Favorite food: chicken tikka masala.’ or ‘The user prefers one choice at a time.’",
        },
        category: { type: "string", enum: ["preference", "fact", "pattern"] },
      },
      required: ["content", "category"],
      additionalProperties: false,
    },
  },
];

type ResponseBlock =
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "text"; text: string }
  | { type: string };

export function parseTaskIntentResponse(blocks: ResponseBlock[]): TaskIntentResult {
  const toolUse = blocks.find((block): block is Extract<ResponseBlock, { type: "tool_use" }> => block.type === "tool_use");
  if (toolUse) {
    const supportedNames = new Set(TASK_TOOLS.map((tool) => tool.name));
    if (!supportedNames.has(toolUse.name)) throw new Error(`Unsupported task tool: ${toolUse.name}`);
    const goalTool = toolUse.name.endsWith("_goal") || toolUse.name === "list_goals";
    const reminderTool = toolUse.name.endsWith("_reminder") || toolUse.name === "list_reminders";
    const memoryTool = toolUse.name === "remember_memory";
    return {
      kind: "command",
      command: toolUse.name === "reschedule_task"
        ? rescheduleCommandSchema.parse({ type: toolUse.name, ...(toolUse.input as object) })
        : memoryTool
        ? memoryCommandSchema.parse({ type: toolUse.name, ...(toolUse.input as object) })
        : reminderTool
        ? reminderCommandSchema.parse({ type: toolUse.name, ...(toolUse.input as object) })
        : goalTool
        ? goalCommandSchema.parse({ type: toolUse.name, ...(toolUse.input as object) })
        : taskCommandSchema.parse({ type: toolUse.name, ...(toolUse.input as object) }),
    };
  }

  const reply = blocks
    .filter((block): block is Extract<ResponseBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 640);
  return {
    kind: "conversation",
    reply: reply || "Tell me what you want to get done, and I’ll help you make the next step concrete.",
  };
}

export class AnthropicTaskIntentParser implements TaskIntentParser {
  private client: Anthropic | undefined;

  async parse(input: Parameters<TaskIntentParser["parse"]>[0]): Promise<TaskIntentResult> {
    const env = requireEnv(["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"]);
    this.client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
    const explicitReminder = isExplicitReminderRequest(input.message);
    const tools = explicitReminder
      ? TASK_TOOLS.filter((tool) => tool.name === "create_reminder")
      : TASK_TOOLS;
    const messages: MessageParam[] = [
      ...(input.history ?? []).slice(-12).map((message): MessageParam => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user", content: input.message },
    ];
    const response = await this.client.messages.create({
      model: env.ANTHROPIC_MODEL!,
      max_tokens: 512,
      system: [
        "You are Tempo, a warm, capable personal assistant with a special focus on ADHD, task paralysis, planning, and gentle follow-through.",
        "Use a tool whenever the user creates, lists, starts, updates, completes, or abandons a task or goal, or asks Tempo to contact them at a future time.",
        "A reminder is an explicit future outreach request such as ‘remind me tomorrow at 10 PM,’ ‘text me every morning at 8,’ or ‘check in with me in 20 minutes.’ Never turn an explicit outreach request into a to-do item. Resolve relative dates using the supplied current time and timezone and include an ISO 8601 offset. Use recurrence only when the user explicitly says daily/every day, weekdays, or weekly/every week. If the time is genuinely missing or ambiguous, ask one short clarifying question instead of guessing.",
        "Never invent a task or goal ID. Use the user's own wording as a query when a deterministic match is uncertain.",
        `Current time: ${input.now.toISOString()}. User timezone: ${input.timezone}.`,
        `Open tasks: ${JSON.stringify(input.openTasks.map(({ id, title, status }) => ({ id, title, status })))}`,
        `Active goals: ${JSON.stringify(input.openGoals.map(({ id, title, status }) => ({ id, title, status })))}`,
        `Relevant user memory: ${JSON.stringify(input.memories.slice(0, 12))}`,
        `User-authored coaching instructions: ${JSON.stringify(input.customInstructions ?? "None provided")}`,
        "For non-task conversation, behave like a useful general personal assistant. You can brainstorm, explain, plan, compare options, suggest meals, and provide concise recipes from general knowledge. Do not falsely claim that Tempo is limited to tasks.",
        "For meal indecision, use remembered favorite foods when available. If the user's preference is unclear, ask one easy choice such as SWEET or SAVORY, LIGHT or FILLING, or QUICK or COOKING; then make a concrete recommendation instead of creating a task.",
        "Use remember_memory when the user explicitly asks you to remember, save, track, or log a durable preference/fact, or when they answer your direct question about what to add to a saved list. Favorite foods should use content like ‘Favorite food: pizza.’ and category preference. Never claim something was saved unless you used the tool.",
        "Do not store passwords, authentication codes, financial account data, detailed medical information, or another person's private information as memory.",
        "You do not currently have live web search. Be honest when genuinely current web information is required, but still help with relevant general knowledge or ask the user for a link.",
        "Keep replies concise and energetic enough for SMS. Emojis are welcome when they add warmth, but usually use no more than one.",
        "Never use guilt, shame, or moralizing.",
        "When a question can be answered with yes/no, done/not done, or another short set, end with explicit uppercase choices. Ask one open question only when you genuinely need more detail.",
      ].join("\n"),
      messages,
      tools,
      tool_choice: { type: "auto" },
    });

    return parseTaskIntentResponse(response.content as ResponseBlock[]);
  }
}
