import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FASTING_LOG: BuiltinCollectionDefinition = {
  name: "fasting_log",
  displayName: "Fasting Log",
  family: "identity_body_religious_fine",
  aliases: ["fasting_log_entry","fasting_log"],
  fields: [
    { name: "kind", type: "select", options: ["intermittent_16_8","intermittent_18_6","omad","ramadan","yom_kippur","lent","water_only","juice_only","custom"] },
    { name: "startedAt", type: "date", required: true },
    { name: "endedAt", type: "date" },
    { name: "brokenAt", type: "date" },
    { name: "intention", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "fasting_log_started_idx", fields: ["startedAt"] },
  ],
};
