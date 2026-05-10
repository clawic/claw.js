import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CRAVINGS_LOGS: BuiltinCollectionDefinition = {
  name: "cravings_logs",
  displayName: "Cravings Logs",
  family: "mental_health_recovery",
  aliases: ["craving_log","cravings_logs"],
  fields: [
    { name: "trackerId", type: "relation", relation: { collectionName: "sobriety_trackers" } },
    { name: "occurredAt", type: "date", required: true },
    { name: "intensity", type: "rating", enumScale: 10 },
    { name: "durationMinutes", type: "duration", durationDisplayUnit: "minute" },
    { name: "triggers", type: "text" },
    { name: "copingAction", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "cravings_logs_tracker_idx", fields: ["trackerId"] },
  ],
};
