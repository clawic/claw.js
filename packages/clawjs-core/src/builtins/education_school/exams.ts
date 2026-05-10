import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EXAMS: BuiltinCollectionDefinition = {
  name: "exams",
  displayName: "Exams",
  family: "education_school",
  aliases: ["exam","exams"],
  fields: [
    { name: "subjectId", type: "relation", required: true, relation: { collectionName: "subjects" } },
    { name: "title", type: "text", required: true },
    { name: "scheduledAt", type: "date" },
    { name: "durationMinutes", type: "number" },
    { name: "status", type: "select", options: ["upcoming","completed","graded","cancelled"] },
    { name: "score", type: "number" },
    { name: "maxScore", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "exams_scheduled_idx", fields: ["scheduledAt"] },
  ],
};
