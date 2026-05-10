import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LANGUAGES_LEARNING: BuiltinCollectionDefinition = {
  name: "languages_learning",
  displayName: "Languages Learning",
  family: "learning",
  aliases: ["language_learning","languages_learning","language"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "nativeName", type: "text" },
    { name: "isoCode", type: "text" },
    { name: "level", type: "select", options: ["a1","a2","b1","b2","c1","c2"] },
    { name: "startedAt", type: "date" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "languages_learning_active_idx", fields: ["active"] },
  ],
};
