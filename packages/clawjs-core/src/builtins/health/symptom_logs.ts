import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SYMPTOM_LOGS: BuiltinCollectionDefinition = {
  name: "symptom_logs",
  displayName: "Symptom Logs",
  family: "health",
  aliases: ["symptom","symptom_log","symptom_logs","symptoms"],
  fields: [
    { name: "loggedAt", type: "date", required: true },
    { name: "symptom", type: "text", required: true },
    { name: "severity", type: "number" },
    { name: "bodyArea", type: "text" },
    { name: "durationMinutes", type: "number" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "symptom_logs_logged_idx", fields: ["loggedAt"] },
    { name: "symptom_logs_symptom_idx", fields: ["symptom"] },
  ],
};
