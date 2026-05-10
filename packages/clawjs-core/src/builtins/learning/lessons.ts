import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LESSONS: BuiltinCollectionDefinition = {
  name: "lessons",
  displayName: "Lessons",
  family: "learning",
  aliases: ["lesson","lessons"],
  fields: [
    { name: "courseId", type: "relation", required: true, relation: { collectionName: "courses" } },
    { name: "title", type: "text", required: true },
    { name: "position", type: "number" },
    { name: "durationMinutes", type: "number" },
    { name: "status", type: "select", options: ["pending","completed","skipped"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "lessons_course_idx", fields: ["courseId"] },
  ],
};
