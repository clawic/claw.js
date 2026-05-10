import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HABIT_LOGS: BuiltinCollectionDefinition = {
  name: "habit_logs",
  displayName: "Habit Logs",
  family: "habits_journaling",
  aliases: ["habit_log","habit_logs"],
  fields: [
    { name: "habitId", type: "relation", required: true, relation: { collectionName: "habits" } },
    { name: "loggedAt", type: "date", required: true },
    { name: "completed", type: "boolean" },
    { name: "value", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "habit_logs_habit_idx", fields: ["habitId"] },
    { name: "habit_logs_logged_idx", fields: ["loggedAt"] },
  ],
};
