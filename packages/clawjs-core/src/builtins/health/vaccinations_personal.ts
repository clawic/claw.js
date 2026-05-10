import type { BuiltinCollectionDefinition } from "../_types.ts";

export const VACCINATIONS_PERSONAL: BuiltinCollectionDefinition = {
  name: "vaccinations_personal",
  displayName: "Vaccinations",
  family: "health",
  aliases: ["vaccination","vaccinations","vaccinations_personal"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "administeredAt", type: "date", required: true },
    { name: "manufacturer", type: "text" },
    { name: "batch", type: "text" },
    { name: "administeredBy", type: "text" },
    { name: "nextDoseAt", type: "date" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "vaccinations_administered_idx", fields: ["administeredAt"] },
  ],
};
