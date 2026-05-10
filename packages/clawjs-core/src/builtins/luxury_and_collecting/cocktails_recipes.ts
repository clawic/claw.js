import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COCKTAILS_RECIPES: BuiltinCollectionDefinition = {
  name: "cocktails_recipes",
  displayName: "Cocktails Recipes",
  family: "luxury_and_collecting",
  aliases: ["cocktail","cocktails_recipes"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "ingredients", type: "json" },
    { name: "garnish", type: "text" },
    { name: "glass", type: "text" },
    { name: "technique", type: "text" },
    { name: "abvEstimated", type: "percent" },
    { name: "instructions", type: "markdown" },
    { name: "image", type: "file" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "cocktails_recipes_name_idx", fields: ["name"] },
  ],
};
