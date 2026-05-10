import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PET_VACCINATIONS: BuiltinCollectionDefinition = {
  name: "pet_vaccinations",
  displayName: "Pet Vaccinations",
  family: "pets",
  aliases: ["pet_vaccination","pet_vaccinations"],
  fields: [
    { name: "petId", type: "relation", required: true, relation: { collectionName: "pets" } },
    { name: "name", type: "text", required: true },
    { name: "administeredAt", type: "date", required: true },
    { name: "nextDoseAt", type: "date" },
    { name: "administeredBy", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "pet_vaccinations_pet_idx", fields: ["petId"] },
  ],
};
