import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PLACES_WISHLIST: BuiltinCollectionDefinition = {
  name: "places_wishlist",
  displayName: "Places Wishlist",
  family: "travel",
  aliases: ["place_wishlist","places_wishlist","bucket_list_place"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "city", type: "text" },
    { name: "country", type: "text" },
    { name: "priority", type: "select", options: ["low","medium","high"] },
    { name: "visited", type: "boolean" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "places_wishlist_country_idx", fields: ["country"] },
  ],
};
