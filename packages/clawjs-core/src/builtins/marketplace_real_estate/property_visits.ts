import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PROPERTY_VISITS: BuiltinCollectionDefinition = {
  name: "property_visits",
  displayName: "Property Visits",
  family: "marketplace_real_estate",
  aliases: ["property_visit","property_visits"],
  fields: [
    { name: "propertyListingId", type: "relation", required: true, relation: { collectionName: "property_listings" } },
    { name: "visitedAt", type: "date", required: true },
    { name: "visitorName", type: "text" },
    { name: "rating", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "property_visits_property_idx", fields: ["propertyListingId"] },
  ],
};
