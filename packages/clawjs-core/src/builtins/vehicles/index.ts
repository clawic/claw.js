import type { BuiltinFamilyDefinition } from "../_types.ts";
import { VEHICLES } from "./vehicles.ts";
import { VEHICLE_MAINTENANCE } from "./vehicle_maintenance.ts";
import { FUEL_LOGS } from "./fuel_logs.ts";
import { MILEAGE_LOGS } from "./mileage_logs.ts";
import { VEHICLE_DOCUMENTS } from "./vehicle_documents.ts";
import { VEHICLE_INSURANCE_POLICIES } from "./vehicle_insurance_policies.ts";

export const VEHICLES_FAMILY: BuiltinFamilyDefinition = {
  name: "vehicles",
  displayName: "Vehicles",
  description: "Vehicles you own, fuel logs, maintenance, mileage, insurance, documents.",
  collections: [VEHICLES, VEHICLE_MAINTENANCE, FUEL_LOGS, MILEAGE_LOGS, VEHICLE_DOCUMENTS, VEHICLE_INSURANCE_POLICIES],
};

export { VEHICLES, VEHICLE_MAINTENANCE, FUEL_LOGS, MILEAGE_LOGS, VEHICLE_DOCUMENTS, VEHICLE_INSURANCE_POLICIES };
