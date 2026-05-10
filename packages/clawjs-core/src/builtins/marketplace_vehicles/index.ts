import type { BuiltinFamilyDefinition } from "../_types.ts";
import { VEHICLE_LISTINGS } from "./vehicle_listings.ts";
import { VEHICLE_TEST_DRIVES } from "./vehicle_test_drives.ts";
import { VEHICLE_INSPECTIONS } from "./vehicle_inspections.ts";

export const MARKETPLACE_VEHICLES_FAMILY: BuiltinFamilyDefinition = {
  name: "marketplace_vehicles",
  displayName: "Marketplace · Used Vehicles",
  description: "Used vehicle listings, test drives, inspections.",
  collections: [VEHICLE_LISTINGS, VEHICLE_TEST_DRIVES, VEHICLE_INSPECTIONS],
};

export { VEHICLE_LISTINGS, VEHICLE_TEST_DRIVES, VEHICLE_INSPECTIONS };
