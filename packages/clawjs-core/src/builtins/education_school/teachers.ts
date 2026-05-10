import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TEACHERS: BuiltinCollectionDefinition = {
  name: "teachers",
  displayName: "Teachers",
  family: "education_school",
  aliases: ["teacher","teachers"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "subject", type: "text" },
    { name: "email", type: "email" },
    { name: "phone", type: "text" },
    { name: "schoolId", type: "relation", relation: { collectionName: "schools" } },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "teachers_name_idx", fields: ["name"] },
  ],
};
