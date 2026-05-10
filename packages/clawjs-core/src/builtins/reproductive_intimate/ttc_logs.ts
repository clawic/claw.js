import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TTC_LOGS: BuiltinCollectionDefinition = {
  name: "ttc_logs",
  displayName: "TTC Logs",
  family: "reproductive_intimate",
  aliases: ["ttc_log","ttc_logs"],
  fields: [
    { name: "cycleId", type: "relation", relation: { collectionName: "fertility_cycles" } },
    { name: "attemptedAt", type: "date", required: true },
    { name: "position", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "ttc_logs_cycle_idx", fields: ["cycleId"] },
  ],
};
