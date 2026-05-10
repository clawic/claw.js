import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PANIC_ANXIETY_LOGS: BuiltinCollectionDefinition = {
  name: "panic_anxiety_logs",
  displayName: "Panic & Anxiety Logs",
  family: "mental_health_recovery",
  aliases: ["panic_anxiety_log","panic_anxiety_logs"],
  fields: [
    { name: "startedAt", type: "date", required: true },
    { name: "durationMinutes", type: "duration", durationDisplayUnit: "minute" },
    { name: "severity", type: "rating", enumScale: 10 },
    { name: "triggers", type: "text" },
    { name: "bodySymptoms", type: "json" },
    { name: "location", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "panic_anxiety_logs_started_idx", fields: ["startedAt"] },
  ],
};
