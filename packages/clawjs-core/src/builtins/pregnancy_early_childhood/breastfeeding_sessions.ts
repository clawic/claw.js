import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BREASTFEEDING_SESSIONS: BuiltinCollectionDefinition = {
  name: "breastfeeding_sessions",
  displayName: "Breastfeeding Sessions",
  family: "pregnancy_early_childhood",
  aliases: ["breastfeeding_session","breastfeeding_sessions"],
  fields: [
    { name: "childId", type: "relation", required: true, relation: { collectionName: "children_profiles" } },
    { name: "startedAt", type: "date", required: true },
    { name: "endedAt", type: "date" },
    { name: "side", type: "select", options: ["left","right","both"] },
    { name: "durationMinutes", type: "duration", durationDisplayUnit: "minute" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "breastfeeding_sessions_child_idx", fields: ["childId"] },
  ],
};
