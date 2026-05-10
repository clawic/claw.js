import type { BuiltinCollectionDefinition } from "../_types.ts";

export const VEHICLE_MAINTENANCE: BuiltinCollectionDefinition = {
  name: "vehicle_maintenance",
  displayName: "Vehicle Maintenance",
  family: "vehicles",
  aliases: ["vehicle_maintenance"],
  fields: [
    { name: "vehicleId", type: "relation", required: true, relation: { collectionName: "vehicles" } },
    { name: "performedAt", type: "date", required: true },
    { name: "title", type: "text", required: true },
    { name: "performedBy", type: "text" },
    { name: "odometerKm", type: "number" },
    { name: "costCents", type: "number" },
    { name: "notes", type: "text" },
    { name: "invoice", type: "file" },
  ],
  indexes: [
    { name: "vehicle_maintenance_vehicle_idx", fields: ["vehicleId"] },
  ],
};
