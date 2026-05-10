import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AVAILABILITY_SLOTS: BuiltinCollectionDefinition = {
  name: "availability_slots",
  displayName: "Availability Slots",
  family: "marketplace_services_rentals",
  aliases: ["availability_slot","availability_slots"],
  fields: [
    { name: "serviceListingId", type: "relation", relation: { collectionName: "service_listings" } },
    { name: "rentalListingId", type: "relation", relation: { collectionName: "rental_listings" } },
    { name: "startsAt", type: "date", required: true },
    { name: "endsAt", type: "date", required: true },
    { name: "blocked", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "availability_slots_starts_idx", fields: ["startsAt"] },
  ],
};
