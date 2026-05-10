import type { BuiltinFamilyDefinition } from "../_types.ts";
import { RECIPES } from "./recipes.ts";

export const COOKING_FAMILY: BuiltinFamilyDefinition = {
  name: "cooking",
  displayName: "Cooking & Food",
  description: "Recipes, meal plans, groceries, restaurants and food diary.",
  collections: [RECIPES],
};

export { RECIPES };
