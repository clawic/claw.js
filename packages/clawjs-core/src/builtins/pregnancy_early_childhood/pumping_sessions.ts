import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PUMPING_SESSIONS: BuiltinCollectionDefinition = {
  name: "pumping_sessions",
  displayName: "Pumping Sessions",
  family: "pregnancy_early_childhood",
  aliases: ["pumping_session","pumping_sessions"],
  fields: [
    { name: "childId", type: "relation", relation: { collectionName: "children_profiles" } },
    { name: "startedAt", type: "date", required: true },
    { name: "durationMinutes", type: "duration", durationDisplayUnit: "minute" },
    { name: "leftMl", type: "number" },
    { name: "rightMl", type: "number" },
    { name: "totalMl", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "pumping_sessions_started_idx", fields: ["startedAt"] },
  ],
};
