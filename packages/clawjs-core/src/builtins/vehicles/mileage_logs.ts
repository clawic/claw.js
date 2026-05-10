import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MILEAGE_LOGS: BuiltinCollectionDefinition = {
  name: "mileage_logs",
  displayName: "Mileage Logs",
  family: "vehicles",
  aliases: ["mileage_log","mileage_logs","mileage"],
  fields: [
    { name: "vehicleId", type: "relation", required: true, relation: { collectionName: "vehicles" } },
    { name: "loggedAt", type: "date", required: true },
    { name: "odometerKm", type: "number", required: true },
    { name: "tripKm", type: "number" },
    { name: "purpose", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "mileage_logs_vehicle_idx", fields: ["vehicleId"] },
  ],
};
