import type { BuiltinFamilyDefinition } from "../_types.ts";
import { TRIPS } from "./trips.ts";
import { TRIP_ITINERARY_ITEMS } from "./trip_itinerary_items.ts";
import { TRIP_PACKING_LISTS } from "./trip_packing_lists.ts";
import { PACKING_ITEMS } from "./packing_items.ts";
import { PLACES_VISITED } from "./places_visited.ts";
import { PLACES_WISHLIST } from "./places_wishlist.ts";
import { ACCOMMODATIONS_BOOKED } from "./accommodations_booked.ts";
import { FLIGHTS } from "./flights.ts";
import { TRANSPORTS_BOOKED } from "./transports_booked.ts";
import { TRAVEL_DOCUMENTS } from "./travel_documents.ts";
import { COUNTRIES_VISITED } from "./countries_visited.ts";

export const TRAVEL_FAMILY: BuiltinFamilyDefinition = {
  name: "travel",
  displayName: "Travel",
  description: "Trips, itineraries, places, flights, accommodations, packing lists.",
  collections: [TRIPS, TRIP_ITINERARY_ITEMS, TRIP_PACKING_LISTS, PACKING_ITEMS, PLACES_VISITED, PLACES_WISHLIST, ACCOMMODATIONS_BOOKED, FLIGHTS, TRANSPORTS_BOOKED, TRAVEL_DOCUMENTS, COUNTRIES_VISITED],
};

export { TRIPS, TRIP_ITINERARY_ITEMS, TRIP_PACKING_LISTS, PACKING_ITEMS, PLACES_VISITED, PLACES_WISHLIST, ACCOMMODATIONS_BOOKED, FLIGHTS, TRANSPORTS_BOOKED, TRAVEL_DOCUMENTS, COUNTRIES_VISITED };
