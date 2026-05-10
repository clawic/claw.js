import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PROPERTY_LISTINGS: BuiltinCollectionDefinition = {
  name: "property_listings",
  displayName: "Property Listings",
  family: "marketplace_real_estate",
  aliases: ["property_listing","property_listings","property"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["apartment","house","studio","commercial","land","other"] },
    { name: "transaction", type: "select", options: ["sale","rent","short_term"] },
    { name: "priceCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "areaSqm", type: "number" },
    { name: "bedrooms", type: "number" },
    { name: "bathrooms", type: "number" },
    { name: "city", type: "text" },
    { name: "address", type: "text" },
    { name: "description", type: "text" },
    { name: "images", type: "json" },
    { name: "status", type: "select", options: ["draft","published","under_offer","sold","rented","withdrawn"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "property_listings_status_idx", fields: ["status"] },
    { name: "property_listings_city_idx", fields: ["city"] },
  ],
};
