import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PETS: BuiltinCollectionDefinition = {
  name: "pets",
  displayName: "Pets",
  family: "pets",
  aliases: ["pet","pets"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "species", type: "text" },
    { name: "breed", type: "text" },
    { name: "birthDate", type: "date" },
    { name: "color", type: "text" },
    { name: "weightKg", type: "number" },
    { name: "sex", type: "select", options: ["male","female","unknown"] },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "pets_name_idx", fields: ["name"] },
  ],
};
