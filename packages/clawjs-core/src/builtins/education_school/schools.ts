import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SCHOOLS: BuiltinCollectionDefinition = {
  name: "schools",
  displayName: "Schools",
  family: "education_school",
  aliases: ["school","schools"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "city", type: "text" },
    { name: "address", type: "text" },
    { name: "website", type: "url" },
    { name: "kind", type: "select", options: ["primary","secondary","high_school","university","language_school","other"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "schools_name_idx", fields: ["name"] },
  ],
};
