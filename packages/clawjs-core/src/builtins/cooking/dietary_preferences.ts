import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DIETARY_PREFERENCES: BuiltinCollectionDefinition = {
  name: "dietary_preferences",
  displayName: "Dietary Preferences",
  family: "cooking",
  aliases: ["dietary_preference","dietary_preferences"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "allowedFoods", type: "json" },
    { name: "forbiddenFoods", type: "json" },
    { name: "active", type: "boolean" },
  ],
  indexes: [
    { name: "dietary_preferences_name_idx", fields: ["name"] },
  ],
};
