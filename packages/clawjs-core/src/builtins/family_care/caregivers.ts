import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CAREGIVERS: BuiltinCollectionDefinition = {
  name: "caregivers",
  displayName: "Caregivers",
  family: "family_care",
  aliases: ["caregiver","caregivers"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "role", type: "text" },
    { name: "phone", type: "text" },
    { name: "email", type: "email" },
    { name: "availability", type: "json" },
    { name: "hourlyRateCents", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "caregivers_name_idx", fields: ["name"] },
  ],
};
