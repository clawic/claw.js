import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EXERCISES: BuiltinCollectionDefinition = {
  name: "exercises",
  displayName: "Exercises (catalog)",
  family: "fitness",
  aliases: ["exercise","exercises"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "category", type: "text" },
    { name: "muscleGroups", type: "json" },
    { name: "equipment", type: "json" },
    { name: "description", type: "text" },
    { name: "videoUrl", type: "url" },
    { name: "favorited", type: "boolean" },
  ],
  indexes: [
    { name: "exercises_name_idx", fields: ["name"] },
    { name: "exercises_category_idx", fields: ["category"] },
  ],
};
