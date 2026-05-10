import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PET_WEIGHT_LOGS: BuiltinCollectionDefinition = {
  name: "pet_weight_logs",
  displayName: "Pet Weight Logs",
  family: "pets",
  aliases: ["pet_weight_log","pet_weight_logs"],
  fields: [
    { name: "petId", type: "relation", required: true, relation: { collectionName: "pets" } },
    { name: "loggedAt", type: "date", required: true },
    { name: "weightKg", type: "number", required: true },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "pet_weight_logs_pet_idx", fields: ["petId"] },
  ],
};
