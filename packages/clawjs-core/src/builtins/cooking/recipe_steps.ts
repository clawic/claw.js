import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RECIPE_STEPS: BuiltinCollectionDefinition = {
  name: "recipe_steps",
  displayName: "Recipe Steps",
  family: "cooking",
  aliases: ["recipe_step","recipe_steps"],
  fields: [
    { name: "recipeId", type: "relation", required: true, relation: { collectionName: "recipes" } },
    { name: "position", type: "number", required: true },
    { name: "instruction", type: "text", required: true },
    { name: "durationMinutes", type: "number" },
    { name: "image", type: "file" },
  ],
  indexes: [
    { name: "recipe_steps_recipe_idx", fields: ["recipeId"] },
  ],
};
