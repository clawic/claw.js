import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BIRTHDAYS: BuiltinCollectionDefinition = {
  name: "birthdays",
  displayName: "Birthdays",
  family: "relationships",
  aliases: ["birthday","birthdays"],
  fields: [
    { name: "personId", type: "relation", relation: { collectionName: "personal_contacts" } },
    { name: "name", type: "text", required: true },
    { name: "birthDate", type: "date", required: true },
    { name: "birthYear", type: "number" },
    { name: "recurring", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "birthdays_date_idx", fields: ["birthDate"] },
  ],
};
