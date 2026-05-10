import type { BuiltinCollectionDefinition } from "../_types.ts";

export const VEHICLE_INSPECTIONS: BuiltinCollectionDefinition = {
  name: "vehicle_inspections",
  displayName: "Vehicle Inspections",
  family: "marketplace_vehicles",
  aliases: ["vehicle_inspection","vehicle_inspections"],
  fields: [
    { name: "vehicleListingId", type: "relation", required: true, relation: { collectionName: "vehicle_listings" } },
    { name: "inspectedAt", type: "date", required: true },
    { name: "inspectorName", type: "text" },
    { name: "findings", type: "json" },
    { name: "notes", type: "text" },
    { name: "report", type: "file" },
  ],
  indexes: [
    { name: "vehicle_inspections_listing_idx", fields: ["vehicleListingId"] },
  ],
};
