import type { BuiltinCollectionDefinition } from "../_types.ts";

export const THERAPISTS: BuiltinCollectionDefinition = {
  name: "therapists",
  displayName: "Therapists",
  family: "mental_health_recovery",
  aliases: ["therapist","therapists"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "license", type: "text" },
    { name: "specialty", type: "text" },
    { name: "hourlyRate", type: "money" },
    { name: "phone", type: "phone" },
    { name: "email", type: "email" },
    { name: "address", type: "address" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "therapists_name_idx", fields: ["name"] },
  ],
};
