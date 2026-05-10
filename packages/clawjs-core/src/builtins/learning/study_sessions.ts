import type { BuiltinCollectionDefinition } from "../_types.ts";

export const STUDY_SESSIONS: BuiltinCollectionDefinition = {
  name: "study_sessions",
  displayName: "Study Sessions",
  family: "learning",
  aliases: ["study_session","study_sessions"],
  fields: [
    { name: "startedAt", type: "date", required: true },
    { name: "durationMinutes", type: "number" },
    { name: "courseId", type: "relation", relation: { collectionName: "courses" } },
    { name: "topic", type: "text" },
    { name: "focusScore", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "study_sessions_started_idx", fields: ["startedAt"] },
  ],
};
