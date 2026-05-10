import type { BuiltinCollectionDefinition } from "../_types.ts";

export const VEHICLE_TEST_DRIVES: BuiltinCollectionDefinition = {
  name: "vehicle_test_drives",
  displayName: "Vehicle Test Drives",
  family: "marketplace_vehicles",
  aliases: ["vehicle_test_drive","vehicle_test_drives"],
  fields: [
    { name: "vehicleListingId", type: "relation", required: true, relation: { collectionName: "vehicle_listings" } },
    { name: "scheduledAt", type: "date", required: true },
    { name: "driverName", type: "text" },
    { name: "rating", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "vehicle_test_drives_listing_idx", fields: ["vehicleListingId"] },
  ],
};
