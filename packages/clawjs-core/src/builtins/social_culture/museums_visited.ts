import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MUSEUMS_VISITED: BuiltinCollectionDefinition = {
  name: "museums_visited",
  displayName: "Museums Visited",
  family: "social_culture",
  aliases: ["museum","museums_visited"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "city", type: "text" },
    { name: "country", type: "text" },
    { name: "visitedAt", type: "date", required: true },
    { name: "exhibitionsSeen", type: "json" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "museums_visited_visited_idx", fields: ["visitedAt"] },
  ],
};
