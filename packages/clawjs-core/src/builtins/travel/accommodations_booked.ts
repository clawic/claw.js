import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ACCOMMODATIONS_BOOKED: BuiltinCollectionDefinition = {
  name: "accommodations_booked",
  displayName: "Accommodations",
  family: "travel",
  aliases: ["accommodation_booked","accommodations_booked","accommodation"],
  fields: [
    { name: "tripId", type: "relation", relation: { collectionName: "trips" } },
    { name: "name", type: "text", required: true },
    { name: "kind", type: "select", options: ["hotel","hostel","apartment","house","camping","other"] },
    { name: "checkInAt", type: "date" },
    { name: "checkOutAt", type: "date" },
    { name: "address", type: "text" },
    { name: "totalCents", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "accommodations_trip_idx", fields: ["tripId"] },
  ],
};
