import type { BuiltinCollectionDefinition } from "../_types.ts";

export const APPLIANCE_MAINTENANCE: BuiltinCollectionDefinition = {
  name: "appliance_maintenance",
  displayName: "Appliance Maintenance",
  family: "possessions",
  aliases: ["appliance_maintenance"],
  fields: [
    { name: "applianceId", type: "relation", required: true, relation: { collectionName: "appliances" } },
    { name: "performedAt", type: "date", required: true },
    { name: "title", type: "text", required: true },
    { name: "performedBy", type: "text" },
    { name: "costCents", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "appliance_maintenance_appliance_idx", fields: ["applianceId"] },
    { name: "appliance_maintenance_performed_idx", fields: ["performedAt"] },
  ],
};
