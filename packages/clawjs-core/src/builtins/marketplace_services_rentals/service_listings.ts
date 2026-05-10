import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SERVICE_LISTINGS: BuiltinCollectionDefinition = {
  name: "service_listings",
  displayName: "Service Listings",
  family: "marketplace_services_rentals",
  aliases: ["service_listing","service_listings"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "category", type: "text" },
    { name: "hourlyRateCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "city", type: "text" },
    { name: "serviceArea", type: "json" },
    { name: "rating", type: "number" },
    { name: "status", type: "select", options: ["draft","published","paused","archived"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "service_listings_status_idx", fields: ["status"] },
    { name: "service_listings_category_idx", fields: ["category"] },
  ],
};
