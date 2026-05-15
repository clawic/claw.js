import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DOCTORS: BuiltinCollectionDefinition = {
  name: "doctors",
  displayName: "Doctors",
  family: "health",
  aliases: ["doctor","doctors"],
  fields: [
    { name: "name", type: "text", required: true, aliases: ["clinicianName"] },
    { name: "specialty", type: "text" },
    { name: "phone", type: "text" },
    { name: "email", type: "email" },
    { name: "address", type: "text" },
    { name: "clinicId", type: "relation", relation: { collectionName: "clinics" } },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "doctors_name_idx", fields: ["name"] },
    { name: "doctors_specialty_idx", fields: ["specialty"] },
  ],
};
