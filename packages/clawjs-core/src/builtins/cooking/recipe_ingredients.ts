import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RECIPE_INGREDIENTS: BuiltinCollectionDefinition = {
  name: "recipe_ingredients",
  displayName: "Recipe Ingredients",
  family: "cooking",
  aliases: ["recipe_ingredient","recipe_ingredients"],
  fields: [
    { name: "recipeId", type: "relation", required: true, relation: { collectionName: "recipes" } },
    { name: "ingredientId", type: "relation", relation: { collectionName: "ingredients" } },
    { name: "name", type: "text" },
    { name: "quantity", type: "number" },
    { name: "unit", type: "text" },
    { name: "position", type: "number" },
    { name: "note", type: "text" },
  ],
  indexes: [
    { name: "recipe_ingredients_recipe_idx", fields: ["recipeId"] },
  ],
};
