import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RENTAL_LISTINGS: BuiltinCollectionDefinition = {
  name: "rental_listings",
  displayName: "Rental Listings",
  family: "marketplace_services_rentals",
  aliases: ["rental_listing","rental_listings"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["vacation_home","room","parking","storage","equipment","other"] },
    { name: "nightlyRateCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "city", type: "text" },
    { name: "description", type: "text" },
    { name: "images", type: "json" },
    { name: "amenities", type: "json" },
    { name: "status", type: "select", options: ["draft","published","paused","archived"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "rental_listings_status_idx", fields: ["status"] },
  ],
};
