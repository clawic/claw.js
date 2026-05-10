import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ALLERGIES_DIAGNOSED: BuiltinCollectionDefinition = {
  name: "allergies_diagnosed",
  displayName: "Allergies",
  family: "health",
  aliases: ["allergy","allergies","allergies_diagnosed"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "allergen", type: "text" },
    { name: "severity", type: "select", options: ["mild","moderate","severe","anaphylactic"] },
    { name: "reaction", type: "text" },
    { name: "diagnosedAt", type: "date" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "allergies_name_idx", fields: ["name"] },
    { name: "allergies_severity_idx", fields: ["severity"] },
  ],
};
