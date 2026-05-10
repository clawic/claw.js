import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RECIPES: BuiltinCollectionDefinition = {
  name: "recipes",
  displayName: "Recipes",
  family: "cooking",
  aliases: ["recipe", "recipes"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "servings", type: "number" },
    { name: "prepTimeMinutes", type: "number" },
    { name: "cookTimeMinutes", type: "number" },
    { name: "cuisine", type: "text" },
    { name: "difficulty", type: "select", options: ["easy", "medium", "hard"] },
    { name: "sourceUrl", type: "url" },
    { name: "tags", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "archived", type: "boolean" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "recipes_title_idx", fields: ["title"] },
    { name: "recipes_cuisine_idx", fields: ["cuisine"] },
    { name: "recipes_favorited_idx", fields: ["favorited"] },
  ],
};
