import type { BuiltinFamilyDefinition } from "../_types.ts";
import { SERVICE_LISTINGS } from "./service_listings.ts";
import { RENTAL_LISTINGS } from "./rental_listings.ts";
import { BOOKINGS } from "./bookings.ts";
import { AVAILABILITY_SLOTS } from "./availability_slots.ts";
import { REVIEWS_RECEIVED } from "./reviews_received.ts";
import { REVIEWS_GIVEN } from "./reviews_given.ts";

export const MARKETPLACE_SERVICES_RENTALS_FAMILY: BuiltinFamilyDefinition = {
  name: "marketplace_services_rentals",
  displayName: "Marketplace · Services & Rentals",
  description: "Service listings, rentals, bookings, availability, reviews.",
  collections: [SERVICE_LISTINGS, RENTAL_LISTINGS, BOOKINGS, AVAILABILITY_SLOTS, REVIEWS_RECEIVED, REVIEWS_GIVEN],
};

export { SERVICE_LISTINGS, RENTAL_LISTINGS, BOOKINGS, AVAILABILITY_SLOTS, REVIEWS_RECEIVED, REVIEWS_GIVEN };
