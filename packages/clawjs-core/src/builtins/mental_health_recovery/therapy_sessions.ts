import type { BuiltinCollectionDefinition } from "../_types.ts";

export const THERAPY_SESSIONS: BuiltinCollectionDefinition = {
  name: "therapy_sessions",
  displayName: "Therapy Sessions",
  family: "mental_health_recovery",
  aliases: ["therapy_session","therapy_sessions"],
  fields: [
    { name: "therapistId", type: "relation", relation: { collectionName: "therapists" } },
    { name: "scheduledAt", type: "date", required: true },
    { name: "modality", type: "select", options: ["cbt","dbt","emdr","psychodynamic","act","ifs","gestalt","narrative","other"] },
    { name: "cost", type: "money" },
    { name: "notesBody", type: "markdown" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "therapy_sessions_scheduled_idx", fields: ["scheduledAt"] },
  ],
};
