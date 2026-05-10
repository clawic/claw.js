import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TRIP_ITINERARY_ITEMS: BuiltinCollectionDefinition = {
  name: "trip_itinerary_items",
  displayName: "Trip Itinerary Items",
  family: "travel",
  aliases: ["trip_itinerary_item","trip_itinerary_items"],
  fields: [
    { name: "tripId", type: "relation", required: true, relation: { collectionName: "trips" } },
    { name: "startsAt", type: "date", required: true },
    { name: "endsAt", type: "date" },
    { name: "title", type: "text", required: true },
    { name: "location", type: "text" },
    { name: "kind", type: "select", options: ["transport","lodging","activity","meal","meeting","other"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "trip_itinerary_trip_idx", fields: ["tripId"] },
  ],
};
