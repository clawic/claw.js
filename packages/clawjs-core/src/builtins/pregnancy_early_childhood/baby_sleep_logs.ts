import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BABY_SLEEP_LOGS: BuiltinCollectionDefinition = {
  name: "baby_sleep_logs",
  displayName: "Baby Sleep Logs",
  family: "pregnancy_early_childhood",
  aliases: ["baby_sleep_log","baby_sleep_logs"],
  fields: [
    { name: "childId", type: "relation", required: true, relation: { collectionName: "children_profiles" } },
    { name: "startedAt", type: "date", required: true },
    { name: "endedAt", type: "date" },
    { name: "durationMinutes", type: "duration", durationDisplayUnit: "minute" },
    { name: "location", type: "text" },
    { name: "kind", type: "select", options: ["nap","night"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "baby_sleep_logs_child_idx", fields: ["childId"] },
  ],
  rules: [
    {"kind":"compare_dates","left":"startedAt","op":"<=","right":"endedAt"},
  ],
};
