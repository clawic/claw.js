import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PROPERTY_INSPECTIONS: BuiltinCollectionDefinition = {
  name: "property_inspections",
  displayName: "Property Inspections",
  family: "marketplace_real_estate",
  aliases: ["property_inspection","property_inspections"],
  fields: [
    { name: "propertyListingId", type: "relation", required: true, relation: { collectionName: "property_listings" } },
    { name: "inspectedAt", type: "date", required: true },
    { name: "inspectorName", type: "text" },
    { name: "findings", type: "json" },
    { name: "estimatedRepairCostCents", type: "number" },
    { name: "notes", type: "text" },
    { name: "report", type: "file" },
  ],
  indexes: [
    { name: "property_inspections_property_idx", fields: ["propertyListingId"] },
  ],
};
