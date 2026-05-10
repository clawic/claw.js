import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MOOD_LOGS: BuiltinCollectionDefinition = {
  name: "mood_logs",
  displayName: "Mood Logs",
  family: "health",
  aliases: ["mood_log","mood_logs","mood"],
  fields: [
    { name: "loggedAt", type: "date", required: true },
    { name: "mood", type: "select", required: true, options: ["terrible","bad","neutral","good","great"] },
    { name: "energy", type: "number" },
    { name: "anxiety", type: "number" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "mood_logs_logged_idx", fields: ["loggedAt"] },
  ],
};
