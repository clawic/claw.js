import type { BuiltinCollectionDefinition } from "../_types.ts";

export const STEP_LOGS: BuiltinCollectionDefinition = {
  name: "step_logs",
  displayName: "Step Logs",
  family: "fitness",
  aliases: ["step_log","step_logs","steps"],
  fields: [
    { name: "date", type: "date", required: true },
    { name: "steps", type: "number", required: true },
    { name: "distanceMeters", type: "number" },
    { name: "activeMinutes", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "step_logs_date_idx", fields: ["date"] },
  ],
};
