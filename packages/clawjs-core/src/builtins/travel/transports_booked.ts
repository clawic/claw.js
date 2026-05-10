import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TRANSPORTS_BOOKED: BuiltinCollectionDefinition = {
  name: "transports_booked",
  displayName: "Transports",
  family: "travel",
  aliases: ["transport_booked","transports_booked","transport"],
  fields: [
    { name: "tripId", type: "relation", relation: { collectionName: "trips" } },
    { name: "kind", type: "select", options: ["train","bus","rental_car","ferry","taxi","other"] },
    { name: "provider", type: "text" },
    { name: "startsAt", type: "date" },
    { name: "endsAt", type: "date" },
    { name: "origin", type: "text" },
    { name: "destination", type: "text" },
    { name: "confirmationCode", type: "text" },
    { name: "priceCents", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "transports_trip_idx", fields: ["tripId"] },
  ],
};
