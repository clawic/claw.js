import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SCHOOL_GRADES: BuiltinCollectionDefinition = {
  name: "school_grades",
  displayName: "School Grades",
  family: "education_school",
  aliases: ["school_grade","school_grades"],
  fields: [
    { name: "subjectId", type: "relation", required: true, relation: { collectionName: "subjects" } },
    { name: "title", type: "text", required: true },
    { name: "term", type: "text" },
    { name: "score", type: "number" },
    { name: "maxScore", type: "number" },
    { name: "weight", type: "number" },
    { name: "gradedAt", type: "date" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "school_grades_subject_idx", fields: ["subjectId"] },
  ],
};
