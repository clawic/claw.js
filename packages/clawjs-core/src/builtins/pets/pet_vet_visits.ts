import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PET_VET_VISITS: BuiltinCollectionDefinition = {
  name: "pet_vet_visits",
  displayName: "Pet Vet Visits",
  family: "pets",
  aliases: ["pet_vet_visit","pet_vet_visits"],
  fields: [
    { name: "petId", type: "relation", required: true, relation: { collectionName: "pets" } },
    { name: "visitedAt", type: "date", required: true },
    { name: "vetName", type: "text" },
    { name: "clinic", type: "text" },
    { name: "reason", type: "text" },
    { name: "costCents", type: "number" },
    { name: "notes", type: "text" },
    { name: "document", type: "file" },
  ],
  indexes: [
    { name: "pet_vet_visits_pet_idx", fields: ["petId"] },
  ],
};
