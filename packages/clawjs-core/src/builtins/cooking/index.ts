import type { BuiltinFamilyDefinition } from "../_types.ts";
import { BREWING_BATCHES } from "./brewing_batches.ts";
import { COOKBOOKS } from "./cookbooks.ts";
import { DIETARY_PREFERENCES } from "./dietary_preferences.ts";
import { FOOD_DIARY_ENTRIES } from "./food_diary_entries.ts";
import { GROCERY_ITEMS } from "./grocery_items.ts";
import { GROCERY_LISTS } from "./grocery_lists.ts";
import { INGREDIENTS } from "./ingredients.ts";
import { KITCHEN_TOOLS } from "./kitchen_tools.ts";
import { MEAL_PLAN_ENTRIES } from "./meal_plan_entries.ts";
import { MEAL_PLANS } from "./meal_plans.ts";
import { PANTRY_ITEMS } from "./pantry_items.ts";
import { RECIPE_COLLECTIONS } from "./recipe_collections.ts";
import { RECIPE_INGREDIENTS } from "./recipe_ingredients.ts";
import { RECIPE_STEPS } from "./recipe_steps.ts";
import { RECIPES } from "./recipes.ts";
import { RESTAURANT_VISITS } from "./restaurant_visits.ts";
import { RESTAURANTS } from "./restaurants.ts";
import { TASTING_NOTES } from "./tasting_notes.ts";
import { WINE_PAIRINGS } from "./wine_pairings.ts";

export const COOKING_FAMILY: BuiltinFamilyDefinition = {
  name: "cooking",
  displayName: "Cooking & Food",
  description: "Recipes, meal plans, groceries, restaurants and food diary.",
  collections: [BREWING_BATCHES, COOKBOOKS, DIETARY_PREFERENCES, FOOD_DIARY_ENTRIES, GROCERY_ITEMS, GROCERY_LISTS, INGREDIENTS, KITCHEN_TOOLS, MEAL_PLAN_ENTRIES, MEAL_PLANS, PANTRY_ITEMS, RECIPE_COLLECTIONS, RECIPE_INGREDIENTS, RECIPE_STEPS, RECIPES, RESTAURANT_VISITS, RESTAURANTS, TASTING_NOTES, WINE_PAIRINGS],
};

export { BREWING_BATCHES, COOKBOOKS, DIETARY_PREFERENCES, FOOD_DIARY_ENTRIES, GROCERY_ITEMS, GROCERY_LISTS, INGREDIENTS, KITCHEN_TOOLS, MEAL_PLAN_ENTRIES, MEAL_PLANS, PANTRY_ITEMS, RECIPE_COLLECTIONS, RECIPE_INGREDIENTS, RECIPE_STEPS, RECIPES, RESTAURANT_VISITS, RESTAURANTS, TASTING_NOTES, WINE_PAIRINGS };
