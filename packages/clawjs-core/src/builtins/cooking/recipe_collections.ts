import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RECIPE_COLLECTIONS: BuiltinCollectionDefinition = {
  name: "recipe_collections",
  displayName: "Recipe Collections",
  family: "cooking",
  aliases: ["recipe_collection","recipe_collections"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "recipeIds", type: "json" },
    { name: "color", type: "text" },
    { name: "favorited", type: "boolean" },
  ],
  indexes: [
    { name: "recipe_collections_title_idx", fields: ["title"] },
  ],
};
