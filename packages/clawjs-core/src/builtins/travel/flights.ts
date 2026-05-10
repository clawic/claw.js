import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FLIGHTS: BuiltinCollectionDefinition = {
  name: "flights",
  displayName: "Flights",
  family: "travel",
  aliases: ["flight","flights"],
  fields: [
    { name: "tripId", type: "relation", relation: { collectionName: "trips" } },
    { name: "flightNumber", type: "text" },
    { name: "airline", type: "text" },
    { name: "origin", type: "text" },
    { name: "destination", type: "text" },
    { name: "departureAt", type: "date" },
    { name: "arrivalAt", type: "date" },
    { name: "confirmationCode", type: "text" },
    { name: "status", type: "select", options: ["booked","checked_in","boarded","completed","cancelled","delayed"] },
    { name: "priceCents", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "flights_trip_idx", fields: ["tripId"] },
    { name: "flights_departure_idx", fields: ["departureAt"] },
  ],
};
