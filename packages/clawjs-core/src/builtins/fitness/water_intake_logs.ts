import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WATER_INTAKE_LOGS: BuiltinCollectionDefinition = {
  name: "water_intake_logs",
  displayName: "Water Intake Logs",
  family: "fitness",
  aliases: ["water_intake_log","water_intake_logs","water"],
  fields: [
    { name: "loggedAt", type: "date", required: true },
    { name: "milliliters", type: "number", required: true },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "water_intake_logs_logged_idx", fields: ["loggedAt"] },
  ],
};
