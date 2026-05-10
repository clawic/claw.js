import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FOOD_DIARY_ENTRIES: BuiltinCollectionDefinition = {
  name: "food_diary_entries",
  displayName: "Food Diary Entries",
  family: "cooking",
  aliases: ["food_diary_entry","food_diary_entries","food_log"],
  fields: [
    { name: "loggedAt", type: "date", required: true },
    { name: "mealType", type: "select", options: ["breakfast","lunch","dinner","snack"] },
    { name: "description", type: "text" },
    { name: "calories", type: "number" },
    { name: "proteinGrams", type: "number" },
    { name: "carbGrams", type: "number" },
    { name: "fatGrams", type: "number" },
    { name: "recipeId", type: "relation", relation: { collectionName: "recipes" } },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "food_diary_entries_logged_idx", fields: ["loggedAt"] },
  ],
};
