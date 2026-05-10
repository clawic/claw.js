import type { BuiltinFamilyDefinition } from "../_types.ts";
import { PROPERTY_LISTINGS } from "./property_listings.ts";
import { PROPERTY_VISITS } from "./property_visits.ts";
import { PROPERTY_OFFERS } from "./property_offers.ts";
import { PROPERTY_INSPECTIONS } from "./property_inspections.ts";

export const MARKETPLACE_REAL_ESTATE_FAMILY: BuiltinFamilyDefinition = {
  name: "marketplace_real_estate",
  displayName: "Marketplace · Real Estate",
  description: "Property listings, visits, offers, inspections.",
  collections: [PROPERTY_LISTINGS, PROPERTY_VISITS, PROPERTY_OFFERS, PROPERTY_INSPECTIONS],
};

export { PROPERTY_LISTINGS, PROPERTY_VISITS, PROPERTY_OFFERS, PROPERTY_INSPECTIONS };
