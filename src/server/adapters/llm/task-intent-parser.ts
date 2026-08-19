import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { requireEnv } from "../../config/env";
import { TaskCommand, TaskSummary, taskCommandSchema } from "../../domain/task-commands";
import { GoalCommand, GoalSummary, goalCommandSchema } from "../../domain/goal-commands";
import { RescheduleCommand, rescheduleCommandSchema } from "../../domain/reschedule-service";

export type CoachingCommand = TaskCommand | GoalCommand | RescheduleCommand;
export type TaskIntentResult = { kind: "command"; command: CoachingCommand } | { kind: "conversation"; reply: string };

export interface TaskIntentParser {
  parse(input: {
    message: string;
    timezone: string;
    now: Date;
    openTasks: TaskSummary[];
    openGoals: GoalSummary[];
    memories: string[];
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
    return {
      kind: "command",
      command: toolUse.name === "reschedule_task"
        ? rescheduleCommandSchema.parse({ type: toolUse.name, ...(toolUse.input as object) })
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
    const messages: MessageParam[] = [{ role: "user", content: input.message }];
    const response = await this.client.messages.create({
      model: env.ANTHROPIC_MODEL!,
      max_tokens: 512,
      system: [
        "You are Tempo's task-and-goal intent boundary. Use a tool whenever the user creates, lists, starts, updates, completes, or abandons a task or goal.",
        "Never invent a task or goal ID. Use the user's own wording as a query when a deterministic match is uncertain.",
        `Current time: ${input.now.toISOString()}. User timezone: ${input.timezone}.`,
        `Open tasks: ${JSON.stringify(input.openTasks.map(({ id, title, status }) => ({ id, title, status })))}`,
        `Active goals: ${JSON.stringify(input.openGoals.map(({ id, title, status }) => ({ id, title, status })))}`,
        `Relevant user memory: ${JSON.stringify(input.memories.slice(0, 8))}`,
        "For non-task conversation, answer in one short, supportive SMS without guilt or moralizing.",
      ].join("\n"),
      messages,
      tools: TASK_TOOLS,
      tool_choice: { type: "auto" },
    });

    return parseTaskIntentResponse(response.content as ResponseBlock[]);
  }
}
