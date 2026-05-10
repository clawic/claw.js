import type { BuiltinCollectionDefinition } from "../_types.ts";

export const VEHICLE_INSURANCE_POLICIES: BuiltinCollectionDefinition = {
  name: "vehicle_insurance_policies",
  displayName: "Vehicle Insurance Policies",
  family: "vehicles",
  aliases: ["vehicle_insurance_policy","vehicle_insurance_policies"],
  fields: [
    { name: "vehicleId", type: "relation", required: true, relation: { collectionName: "vehicles" } },
    { name: "policyNumber", type: "text" },
    { name: "provider", type: "text" },
    { name: "startedAt", type: "date" },
    { name: "expiresAt", type: "date" },
    { name: "premiumCents", type: "number" },
    { name: "coverage", type: "text" },
    { name: "document", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "vehicle_insurance_expires_idx", fields: ["expiresAt"] },
  ],
};
