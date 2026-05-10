import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CLASSES: BuiltinCollectionDefinition = {
  name: "classes",
  displayName: "Classes",
  family: "education_school",
  aliases: ["class","classes"],
  fields: [
    { name: "subjectId", type: "relation", required: true, relation: { collectionName: "subjects" } },
    { name: "scheduledAt", type: "date", required: true },
    { name: "durationMinutes", type: "number" },
    { name: "location", type: "text" },
    { name: "title", type: "text", required: true },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "classes_subject_idx", fields: ["subjectId"] },
    { name: "classes_scheduled_idx", fields: ["scheduledAt"] },
  ],
};
