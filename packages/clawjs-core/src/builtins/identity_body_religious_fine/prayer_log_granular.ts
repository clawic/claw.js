import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRAYER_LOG_GRANULAR: BuiltinCollectionDefinition = {
  name: "prayer_log_granular",
  displayName: "Prayer Log (granular)",
  family: "identity_body_religious_fine",
  aliases: ["prayer_entry","prayer_log_granular"],
  fields: [
    { name: "tradition", type: "text" },
    { name: "prayerName", type: "text", required: true },
    { name: "location", type: "text" },
    { name: "startedAt", type: "date", required: true },
    { name: "durationMinutes", type: "duration", durationDisplayUnit: "minute" },
    { name: "intention", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "prayer_log_granular_tradition_idx", fields: ["tradition"] },
  ],
};
