import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COUNTRIES_VISITED: BuiltinCollectionDefinition = {
  name: "countries_visited",
  displayName: "Countries Visited",
  family: "travel",
  aliases: ["country_visited","countries_visited"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "isoCode", type: "text" },
    { name: "firstVisitedAt", type: "date" },
    { name: "visitCount", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "countries_visited_name_idx", fields: ["name"] },
  ],
};
