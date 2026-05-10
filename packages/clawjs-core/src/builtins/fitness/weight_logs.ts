import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WEIGHT_LOGS: BuiltinCollectionDefinition = {
  name: "weight_logs",
  displayName: "Weight Logs",
  family: "fitness",
  aliases: ["weight_log","weight_logs","weight"],
  fields: [
    { name: "loggedAt", type: "date", required: true },
    { name: "weightKg", type: "number", required: true },
    { name: "bodyFatPercent", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "weight_logs_logged_idx", fields: ["loggedAt"] },
  ],
};
