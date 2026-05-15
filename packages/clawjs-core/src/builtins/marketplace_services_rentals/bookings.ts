import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BOOKINGS: BuiltinCollectionDefinition = {
  name: "bookings",
  displayName: "Bookings",
  family: "marketplace_services_rentals",
  aliases: ["booking","bookings"],
  fields: [
    { name: "serviceListingId", type: "relation", relation: { collectionName: "service_listings" } },
    { name: "rentalListingId", type: "relation", relation: { collectionName: "rental_listings" } },
    { name: "startsAt", type: "date", required: true, aliases: ["bookingStartsAt"] },
    { name: "endsAt", type: "date", aliases: ["bookingEndsAt"] },
    { name: "guestName", type: "text" },
    { name: "totalCents", type: "number", aliases: ["bookingTotalCents"] },
    { name: "currency", type: "text" },
    { name: "status", type: "select", options: ["pending","confirmed","completed","cancelled","no_show"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "bookings_status_idx", fields: ["status"] },
    { name: "bookings_starts_idx", fields: ["startsAt"] },
  ],
};
