import { parseGoalCommandHeuristically } from "../domain/goal-commands";
import { parseTaskCommandHeuristically } from "../domain/task-commands";
import { parseRescheduleHeuristically } from "../domain/reschedule-service";
import { WRITE_COMMANDS, type TurnAuthorizer } from "../domain/turn-write-policy";

/** Provider-free legacy journey fixture. Not a production authorization policy.
 * Explicit authorization tests supply their own grants instead. */
export const scriptedAuthorizer: TurnAuthorizer = {
  authorize: async ({message}) => {
    // The fixture must not confuse canceling a reminder with abandoning a
    // task. Production uses the independent semantic authorizer instead.
    if (/^cancel\s+.*\breminder\b/i.test(message)) return { mode: "write", commands: ["cancel_reminder"] };
    const command = parseGoalCommandHeuristically(message) ?? parseRescheduleHeuristically(message)
      ?? parseTaskCommandHeuristically(message, new Date("2026-08-18T12:00:00Z"));
    const type = WRITE_COMMANDS.find(type => type === command?.type);
    return { mode: "write", commands: type ? [type] : [...WRITE_COMMANDS] };
  },
};
