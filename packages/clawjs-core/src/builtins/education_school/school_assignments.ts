import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SCHOOL_ASSIGNMENTS: BuiltinCollectionDefinition = {
  name: "school_assignments",
  displayName: "School Assignments",
  family: "education_school",
  aliases: ["school_assignment", "school_assignments"],
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
    { name: "school_assignments_due_idx", fields: ["dueAt"] },
    { name: "school_assignments_status_idx", fields: ["status"] },
  ],
};
