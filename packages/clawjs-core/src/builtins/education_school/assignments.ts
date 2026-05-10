import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ASSIGNMENTS: BuiltinCollectionDefinition = {
  name: "assignments",
  displayName: "Assignments",
  family: "education_school",
  aliases: ["assignment","assignments"],
  fields: [
    { name: "subjectId", type: "relation", required: true, relation: { collectionName: "subjects" } },
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "dueAt", type: "date" },
    { name: "status", type: "select", options: ["pending","in_progress","submitted","graded"] },
    { name: "score", type: "number" },
    { name: "maxScore", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "assignments_due_idx", fields: ["dueAt"] },
    { name: "assignments_status_idx", fields: ["status"] },
  ],
};
