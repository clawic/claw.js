import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PERIOD_LOGS: BuiltinCollectionDefinition = {
  name: "period_logs",
  displayName: "Period Logs",
  family: "health",
  aliases: ["period_log","period_logs","period"],
  fields: [
    { name: "startDate", type: "date", required: true },
    { name: "endDate", type: "date" },
    { name: "flow", type: "select", options: ["spotting","light","medium","heavy"] },
    { name: "symptoms", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "period_logs_start_idx", fields: ["startDate"] },
  ],
};
