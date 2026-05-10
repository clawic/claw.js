import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PET_MEDICATIONS: BuiltinCollectionDefinition = {
  name: "pet_medications",
  displayName: "Pet Medications",
  family: "pets",
  aliases: ["pet_medication","pet_medications"],
  fields: [
    { name: "petId", type: "relation", required: true, relation: { collectionName: "pets" } },
    { name: "name", type: "text", required: true },
    { name: "dosage", type: "text" },
    { name: "cadence", type: "select", options: ["once","daily","twice_daily","weekly","monthly"] },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "pet_medications_pet_idx", fields: ["petId"] },
  ],
};
