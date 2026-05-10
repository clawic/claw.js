import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEDICATIONS: BuiltinCollectionDefinition = {
  name: "medications",
  displayName: "Medications",
  family: "health",
  aliases: ["medication","medications"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "activeIngredient", type: "text" },
    { name: "dosage", type: "text" },
    { name: "form", type: "text" },
    { name: "prescribedFor", type: "text" },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "medications_name_idx", fields: ["name"] },
    { name: "medications_active_idx", fields: ["active"] },
  ],
};
