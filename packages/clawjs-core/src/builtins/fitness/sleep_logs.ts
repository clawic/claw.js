import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SLEEP_LOGS: BuiltinCollectionDefinition = {
  name: "sleep_logs",
  displayName: "Sleep Logs",
  family: "fitness",
  aliases: ["sleep_log","sleep_logs","sleep"],
  fields: [
    { name: "date", type: "date", required: true },
    { name: "bedtime", type: "date" },
    { name: "wakeUpAt", type: "date" },
    { name: "durationMinutes", type: "number" },
    { name: "quality", type: "number" },
    { name: "hadDreams", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "sleep_logs_date_idx", fields: ["date"] },
  ],
};
