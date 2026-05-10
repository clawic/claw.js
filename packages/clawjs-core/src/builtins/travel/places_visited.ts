import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PLACES_VISITED: BuiltinCollectionDefinition = {
  name: "places_visited",
  displayName: "Places Visited",
  family: "travel",
  aliases: ["place_visited","places_visited"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "city", type: "text" },
    { name: "country", type: "text" },
    { name: "visitedAt", type: "date" },
    { name: "rating", type: "number" },
    { name: "tags", type: "json" },
    { name: "images", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "places_visited_country_idx", fields: ["country"] },
  ],
};
