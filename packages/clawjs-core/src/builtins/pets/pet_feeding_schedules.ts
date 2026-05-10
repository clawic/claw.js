import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PET_FEEDING_SCHEDULES: BuiltinCollectionDefinition = {
  name: "pet_feeding_schedules",
  displayName: "Pet Feeding Schedules",
  family: "pets",
  aliases: ["pet_feeding_schedule","pet_feeding_schedules"],
  fields: [
    { name: "petId", type: "relation", required: true, relation: { collectionName: "pets" } },
    { name: "title", type: "text", required: true },
    { name: "foodBrand", type: "text" },
    { name: "amount", type: "text" },
    { name: "cadence", type: "select", options: ["daily","twice_daily","thrice_daily","weekly","custom"] },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "pet_feeding_schedules_pet_idx", fields: ["petId"] },
  ],
};
