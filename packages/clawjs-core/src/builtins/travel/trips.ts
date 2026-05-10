import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TRIPS: BuiltinCollectionDefinition = {
  name: "trips",
  displayName: "Trips",
  family: "travel",
  aliases: ["trip","trips"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "startDate", type: "date" },
    { name: "endDate", type: "date" },
    { name: "destination", type: "text" },
    { name: "status", type: "select", options: ["planning","booked","in_progress","completed","cancelled"] },
    { name: "budgetCents", type: "number" },
    { name: "tags", type: "json" },
    { name: "images", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "trips_status_idx", fields: ["status"] },
    { name: "trips_start_idx", fields: ["startDate"] },
  ],
};
