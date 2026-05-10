import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTRACTIONS_LOGS: BuiltinCollectionDefinition = {
  name: "contractions_logs",
  displayName: "Contractions Logs",
  family: "pregnancy_early_childhood",
  aliases: ["contraction_log","contractions_logs"],
  fields: [
    { name: "pregnancyId", type: "relation", required: true, relation: { collectionName: "pregnancies" } },
    { name: "startedAt", type: "date", required: true },
    { name: "durationSeconds", type: "duration", durationDisplayUnit: "second" },
    { name: "intervalSeconds", type: "duration", durationDisplayUnit: "second" },
    { name: "intensity", type: "rating", enumScale: 10 },
  ],
  indexes: [
    { name: "contractions_logs_pregnancy_idx", fields: ["pregnancyId"] },
    { name: "contractions_logs_started_idx", fields: ["startedAt"] },
  ],
};
