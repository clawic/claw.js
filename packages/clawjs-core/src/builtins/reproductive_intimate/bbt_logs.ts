import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BBT_LOGS: BuiltinCollectionDefinition = {
  name: "bbt_logs",
  displayName: "BBT Logs",
  family: "reproductive_intimate",
  aliases: ["bbt_log","bbt_logs"],
  fields: [
    { name: "loggedAt", type: "date", required: true },
    { name: "temperatureCelsius", type: "number" },
    { name: "timeTaken", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "bbt_logs_logged_idx", fields: ["loggedAt"] },
  ],
};
