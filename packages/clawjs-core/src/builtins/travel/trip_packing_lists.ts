import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TRIP_PACKING_LISTS: BuiltinCollectionDefinition = {
  name: "trip_packing_lists",
  displayName: "Trip Packing Lists",
  family: "travel",
  aliases: ["trip_packing_list","trip_packing_lists"],
  fields: [
    { name: "tripId", type: "relation", required: true, relation: { collectionName: "trips" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "trip_packing_lists_trip_idx", fields: ["tripId"] },
  ],
};
