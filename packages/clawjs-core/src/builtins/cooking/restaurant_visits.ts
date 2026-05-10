import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RESTAURANT_VISITS: BuiltinCollectionDefinition = {
  name: "restaurant_visits",
  displayName: "Restaurant Visits",
  family: "cooking",
  aliases: ["restaurant_visit","restaurant_visits"],
  fields: [
    { name: "restaurantId", type: "relation", required: true, relation: { collectionName: "restaurants" } },
    { name: "visitedAt", type: "date", required: true },
    { name: "rating", type: "number" },
    { name: "dishesOrdered", type: "text" },
    { name: "totalCents", type: "number" },
    { name: "notes", type: "text" },
    { name: "images", type: "json" },
  ],
  indexes: [
    { name: "restaurant_visits_restaurant_idx", fields: ["restaurantId"] },
    { name: "restaurant_visits_date_idx", fields: ["visitedAt"] },
  ],
};
