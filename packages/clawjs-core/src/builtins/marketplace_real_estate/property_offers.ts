import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PROPERTY_OFFERS: BuiltinCollectionDefinition = {
  name: "property_offers",
  displayName: "Property Offers",
  family: "marketplace_real_estate",
  aliases: ["property_offer","property_offers"],
  fields: [
    { name: "propertyListingId", type: "relation", required: true, relation: { collectionName: "property_listings" } },
    { name: "offeredAt", type: "date", required: true },
    { name: "amountCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "buyerName", type: "text" },
    { name: "status", type: "select", options: ["pending","accepted","rejected","withdrawn","countered"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "property_offers_status_idx", fields: ["status"] },
  ],
};
