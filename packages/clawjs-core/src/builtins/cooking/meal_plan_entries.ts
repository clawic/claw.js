import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEAL_PLAN_ENTRIES: BuiltinCollectionDefinition = {
  name: "meal_plan_entries",
  displayName: "Meal Plan Entries",
  family: "cooking",
  aliases: ["meal_plan_entry","meal_plan_entries"],
  fields: [
    { name: "mealPlanId", type: "relation", required: true, relation: { collectionName: "meal_plans" } },
    { name: "date", type: "date", required: true },
    { name: "mealType", type: "select", required: true, options: ["breakfast","lunch","dinner","snack"] },
    { name: "recipeId", type: "relation", relation: { collectionName: "recipes" } },
    { name: "customMeal", type: "text" },
    { name: "servings", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "meal_plan_entries_plan_idx", fields: ["mealPlanId"] },
    { name: "meal_plan_entries_date_idx", fields: ["date"] },
  ],
};
