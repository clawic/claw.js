import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUBJECTS: BuiltinCollectionDefinition = {
  name: "subjects",
  displayName: "Subjects",
  family: "education_school",
  aliases: ["subject","subjects"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "teacher", type: "text" },
    { name: "color", type: "text" },
    { name: "term", type: "text" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "subjects_active_idx", fields: ["active"] },
  ],
};
