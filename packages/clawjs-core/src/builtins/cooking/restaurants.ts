import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RESTAURANTS: BuiltinCollectionDefinition = {
  name: "restaurants",
  displayName: "Restaurants",
  family: "cooking",
  aliases: ["restaurant","restaurants"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "cuisine", type: "text" },
    { name: "city", type: "text" },
    { name: "address", type: "text" },
    { name: "website", type: "url" },
    { name: "phone", type: "text" },
    { name: "priceLevel", type: "number" },
    { name: "rating", type: "number" },
    { name: "tags", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "restaurants_name_idx", fields: ["name"] },
    { name: "restaurants_city_idx", fields: ["city"] },
  ],
};
