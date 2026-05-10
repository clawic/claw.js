import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SCRIPTURE_READING_LOG: BuiltinCollectionDefinition = {
  name: "scripture_reading_log",
  displayName: "Scripture Reading Log",
  family: "identity_body_religious_fine",
  aliases: ["scripture_reading_entry","scripture_reading_log"],
  fields: [
    { name: "tradition", type: "text" },
    { name: "reference", type: "text", required: true },
    { name: "startedAt", type: "date", required: true },
    { name: "durationMinutes", type: "duration", durationDisplayUnit: "minute" },
    { name: "reflectionBody", type: "markdown" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "scripture_reading_log_started_idx", fields: ["startedAt"] },
  ],
};
