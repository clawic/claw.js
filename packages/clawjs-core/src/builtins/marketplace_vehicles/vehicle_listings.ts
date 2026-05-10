import type { BuiltinCollectionDefinition } from "../_types.ts";

export const VEHICLE_LISTINGS: BuiltinCollectionDefinition = {
  name: "vehicle_listings",
  displayName: "Vehicle Listings",
  family: "marketplace_vehicles",
  aliases: ["vehicle_listing","vehicle_listings"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "make", type: "text" },
    { name: "model", type: "text" },
    { name: "year", type: "number" },
    { name: "priceCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "odometerKm", type: "number" },
    { name: "fuelType", type: "select", options: ["gasoline","diesel","hybrid","electric","lpg","other"] },
    { name: "transmission", type: "text" },
    { name: "city", type: "text" },
    { name: "description", type: "text" },
    { name: "images", type: "json" },
    { name: "status", type: "select", options: ["draft","published","reserved","sold","withdrawn"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "vehicle_listings_status_idx", fields: ["status"] },
  ],
};
