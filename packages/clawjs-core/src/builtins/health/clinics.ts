import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CLINICS: BuiltinCollectionDefinition = {
  name: "clinics",
  displayName: "Clinics & Hospitals",
  family: "health",
  aliases: ["clinic","clinics"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "city", type: "text" },
    { name: "address", type: "text" },
    { name: "phone", type: "text" },
    { name: "website", type: "url" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "clinics_name_idx", fields: ["name"] },
  ],
};
