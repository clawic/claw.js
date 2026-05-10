import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INGREDIENTS: BuiltinCollectionDefinition = {
  name: "ingredients",
  displayName: "Ingredients (catalog)",
  family: "cooking",
  aliases: ["ingredient","ingredients"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "category", type: "text" },
    { name: "defaultUnit", type: "text" },
    { name: "nutrition", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "ingredients_name_idx", fields: ["name"] },
    { name: "ingredients_category_idx", fields: ["category"] },
  ],
};
