import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FUEL_LOGS: BuiltinCollectionDefinition = {
  name: "fuel_logs",
  displayName: "Fuel Logs",
  family: "vehicles",
  aliases: ["fuel_log","fuel_logs","fuel"],
  fields: [
    { name: "vehicleId", type: "relation", required: true, relation: { collectionName: "vehicles" } },
    { name: "filledAt", type: "date", required: true },
    { name: "volumeLiters", type: "number" },
    { name: "pricePerLiterCents", type: "number" },
    { name: "totalCents", type: "number" },
    { name: "odometerKm", type: "number" },
    { name: "station", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "fuel_logs_vehicle_idx", fields: ["vehicleId"] },
    { name: "fuel_logs_filled_idx", fields: ["filledAt"] },
  ],
};
