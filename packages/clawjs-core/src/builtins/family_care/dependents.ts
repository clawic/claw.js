import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DEPENDENTS: BuiltinCollectionDefinition = {
  name: "dependents",
  displayName: "Dependents",
  family: "family_care",
  aliases: ["dependent","dependents"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "relation", type: "text" },
    { name: "birthDate", type: "date" },
    { name: "description", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "dependents_name_idx", fields: ["name"] },
  ],
};
