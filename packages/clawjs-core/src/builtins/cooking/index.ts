import type { BuiltinFamilyDefinition } from "../_types.ts";
import { RECIPES } from "./recipes.ts";
import { RECIPE_INGREDIENTS } from "./recipe_ingredients.ts";
import { RECIPE_STEPS } from "./recipe_steps.ts";
import { INGREDIENTS } from "./ingredients.ts";
import { COOKBOOKS } from "./cookbooks.ts";
import { RECIPE_COLLECTIONS } from "./recipe_collections.ts";
import { MEAL_PLANS } from "./meal_plans.ts";
import { MEAL_PLAN_ENTRIES } from "./meal_plan_entries.ts";
import { GROCERY_LISTS } from "./grocery_lists.ts";
import { GROCERY_ITEMS } from "./grocery_items.ts";
import { RESTAURANTS } from "./restaurants.ts";
import { RESTAURANT_VISITS } from "./restaurant_visits.ts";
import { FOOD_DIARY_ENTRIES } from "./food_diary_entries.ts";
import { DIETARY_PREFERENCES } from "./dietary_preferences.ts";

export const COOKING_FAMILY: BuiltinFamilyDefinition = {
  name: "cooking",
  displayName: "Cooking & Food",
  description: "Recipes, meal plans, groceries, restaurants and food diary.",
  collections: [RECIPES, RECIPE_INGREDIENTS, RECIPE_STEPS, INGREDIENTS, COOKBOOKS, RECIPE_COLLECTIONS, MEAL_PLANS, MEAL_PLAN_ENTRIES, GROCERY_LISTS, GROCERY_ITEMS, RESTAURANTS, RESTAURANT_VISITS, FOOD_DIARY_ENTRIES, DIETARY_PREFERENCES],
};

export { RECIPES, RECIPE_INGREDIENTS, RECIPE_STEPS, INGREDIENTS, COOKBOOKS, RECIPE_COLLECTIONS, MEAL_PLANS, MEAL_PLAN_ENTRIES, GROCERY_LISTS, GROCERY_ITEMS, RESTAURANTS, RESTAURANT_VISITS, FOOD_DIARY_ENTRIES, DIETARY_PREFERENCES };
